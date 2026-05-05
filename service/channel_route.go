package service

import (
	"errors"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

const ginKeyChannelRouteLogInfo = "channel_route_log_info"

var channelRouteRegexCache sync.Map // map[string]*regexp.Regexp

type ChannelRouteMatch struct {
	Channel     *model.Channel
	SelectGroup string
	Matched     bool
	Strict      bool
	Exhausted   bool
	RuleName    string
}

func GetChannelByRoute(param *RetryParam) (*ChannelRouteMatch, error) {
	result := &ChannelRouteMatch{}
	if param == nil || param.Ctx == nil || param.ModelName == "" {
		return result, nil
	}

	settingConfig := operation_setting.GetChannelRouteSetting()
	if settingConfig == nil || !settingConfig.Enabled {
		return result, nil
	}

	path := ""
	if param.Ctx.Request != nil && param.Ctx.Request.URL != nil {
		path = param.Ctx.Request.URL.Path
	}
	matchGroup := getChannelRouteMatchGroup(param)

	for _, rule := range settingConfig.Rules {
		if len(rule.GroupRegex) > 0 && !channelRouteMatchAnyRegex(rule.GroupRegex, matchGroup) {
			continue
		}
		if !channelRouteMatchAnyRegex(rule.ModelRegex, param.ModelName) {
			continue
		}
		if len(rule.PathRegex) > 0 && !channelRouteMatchAnyRegex(rule.PathRegex, path) {
			continue
		}

		result.Matched = true
		result.Strict = rule.Strict
		result.RuleName = strings.TrimSpace(rule.Name)

		// Tiered channel routing
		channelIDs := rule.ChannelIDs
		matchedTier := ""
		estimatedTokens := common.GetContextKeyInt(param.Ctx, constant.ContextKeyEstimatedTokens)
		if len(rule.RouteTiers) > 0 && estimatedTokens > 0 {
			for _, tier := range rule.RouteTiers {
				if evaluateRouteTier(tier.Conditions, estimatedTokens) {
					if len(tier.ChannelIDs) > 0 {
						channelIDs = tier.ChannelIDs
						matchedTier = tier.Label
					}
					break
				}
			}
		}

		channel, selectGroup, exhausted, err := getRouteSatisfiedChannel(param, channelIDs)
		if err != nil {
			return nil, err
		}
		result.Channel = channel
		result.SelectGroup = selectGroup
		result.Exhausted = exhausted

		if channel != nil {
			markChannelRouteUsed(param.Ctx, rule, param.ModelName, param.TokenGroup, selectGroup, channel.Id, path, estimatedTokens, matchedTier)
		} else {
			markChannelRouteExhausted(param.Ctx, rule, param.ModelName, param.TokenGroup, path, estimatedTokens, matchedTier)
		}
		return result, nil
	}

	return result, nil
}

func evaluateRouteTier(conditions []operation_setting.RouteTierCondition, estimatedTokens int) bool {
	if len(conditions) == 0 {
		return true
	}
	for _, cond := range conditions {
		if !evaluateRouteCondition(cond, estimatedTokens) {
			return false
		}
	}
	return true
}

func evaluateRouteCondition(cond operation_setting.RouteTierCondition, estimatedTokens int) bool {
	var actual int
	switch cond.Var {
	case "len", "p":
		actual = estimatedTokens
	case "c":
		actual = 0 // completion tokens unknown at routing time
	default:
		return false
	}
	switch cond.Op {
	case "<":
		return actual < cond.Value
	case "<=":
		return actual <= cond.Value
	case ">":
		return actual > cond.Value
	case ">=":
		return actual >= cond.Value
	default:
		return false
	}
}

func getChannelRouteMatchGroup(param *RetryParam) string {
	if param == nil || param.Ctx == nil {
		return ""
	}
	usingGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyUsingGroup)
	if usingGroup != "" && usingGroup != "auto" {
		return usingGroup
	}
	userGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyUserGroup)
	if userGroup != "" {
		return userGroup
	}
	if usingGroup != "" {
		return usingGroup
	}
	return param.TokenGroup
}

func getRouteSatisfiedChannel(param *RetryParam, channelIDs []int) (*model.Channel, string, bool, error) {
	if len(channelIDs) == 0 {
		return nil, param.TokenGroup, true, nil
	}

	selectGroup := param.TokenGroup
	userGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyUserGroup)

	if param.TokenGroup == "auto" {
		if len(setting.GetAutoGroups()) == 0 {
			return nil, selectGroup, false, errors.New("auto groups is not enabled")
		}

		autoGroups := GetUserAutoGroup(userGroup)
		startGroupIndex := 0
		crossGroupRetry := common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenCrossGroupRetry)

		if lastGroupIndex, exists := common.GetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex); exists {
			if idx, ok := lastGroupIndex.(int); ok {
				startGroupIndex = idx
			}
		}

		for i := startGroupIndex; i < len(autoGroups); i++ {
			autoGroup := autoGroups[i]
			priorityRetry := param.GetRetry()
			if i > startGroupIndex {
				priorityRetry = 0
			}

			channel, err := getRouteRandomSatisfiedChannel(autoGroup, param.ModelName, priorityRetry, channelIDs)
			if err != nil {
				return nil, autoGroup, false, err
			}
			if channel == nil {
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupRetryIndex, 0)
				param.SetRetry(0)
				continue
			}

			common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, autoGroup)
			selectGroup = autoGroup
			if crossGroupRetry && priorityRetry >= common.RetryTimes {
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				param.SetRetry(0)
				param.ResetRetryNextTry()
			} else {
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i)
			}
			return channel, selectGroup, false, nil
		}
		return nil, selectGroup, true, nil
	}

	channel, err := getRouteRandomSatisfiedChannel(param.TokenGroup, param.ModelName, param.GetRetry(), channelIDs)
	if err != nil {
		return nil, param.TokenGroup, false, err
	}
	if channel == nil {
		return nil, param.TokenGroup, true, nil
	}
	return channel, param.TokenGroup, false, nil
}

func getRouteRandomSatisfiedChannel(group string, modelName string, retry int, channelIDs []int) (*model.Channel, error) {
	channels := collectRouteCandidatesForGroup(group, modelName, channelIDs)
	if len(channels) == 0 {
		return nil, nil
	}
	if len(channels) == 1 {
		return channels[0], nil
	}

	uniquePriorities := make(map[int]bool)
	for _, channel := range channels {
		uniquePriorities[int(channel.GetPriority())] = true
	}

	if len(uniquePriorities) == 0 {
		return nil, nil
	}

	sortedUniquePriorities := make([]int, 0, len(uniquePriorities))
	for priority := range uniquePriorities {
		sortedUniquePriorities = append(sortedUniquePriorities, priority)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(sortedUniquePriorities)))

	if retry >= len(uniquePriorities) {
		retry = len(uniquePriorities) - 1
	}
	targetPriority := int64(sortedUniquePriorities[retry])

	targetChannels := make([]*model.Channel, 0, len(channels))
	sumWeight := 0
	for _, channel := range channels {
		if channel.GetPriority() == targetPriority {
			sumWeight += channel.GetWeight()
			targetChannels = append(targetChannels, channel)
		}
	}
	if len(targetChannels) == 0 {
		return nil, nil
	}
	if len(targetChannels) == 1 {
		return targetChannels[0], nil
	}

	smoothingFactor := 1
	smoothingAdjustment := 0
	if sumWeight == 0 {
		sumWeight = len(targetChannels) * 100
		smoothingAdjustment = 100
	} else if sumWeight/len(targetChannels) < 10 {
		smoothingFactor = 100
	}

	totalWeight := sumWeight * smoothingFactor
	randomWeight := common.GetRandomInt(totalWeight)
	for _, channel := range targetChannels {
		randomWeight -= channel.GetWeight()*smoothingFactor + smoothingAdjustment
		if randomWeight < 0 {
			return channel, nil
		}
	}
	return targetChannels[len(targetChannels)-1], nil
}

func collectRouteCandidatesForGroup(group string, modelName string, channelIDs []int) []*model.Channel {
	if group == "" || modelName == "" || len(channelIDs) == 0 {
		return nil
	}

	candidates := make([]*model.Channel, 0, len(channelIDs))
	seen := make(map[int]struct{}, len(channelIDs))
	for _, channelID := range channelIDs {
		if channelID <= 0 {
			continue
		}
		if _, ok := seen[channelID]; ok {
			continue
		}
		seen[channelID] = struct{}{}

		channelModel, err := model.CacheGetChannel(channelID)
		if err != nil || channelModel == nil || channelModel.Status != common.ChannelStatusEnabled {
			continue
		}
		if model.IsChannelEnabledForGroupModel(group, modelName, channelID) {
			candidates = append(candidates, channelModel)
		}
	}
	return candidates
}

func channelRouteMatchAnyRegex(patterns []string, value string) bool {
	if len(patterns) == 0 || value == "" {
		return false
	}
	for _, pattern := range patterns {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		compiled, ok := channelRouteRegexCache.Load(pattern)
		if !ok {
			re, err := regexp.Compile(pattern)
			if err != nil {
				continue
			}
			compiled, _ = channelRouteRegexCache.LoadOrStore(pattern, re)
		}
		if re, ok := compiled.(*regexp.Regexp); ok && re.MatchString(value) {
			return true
		}
	}
	return false
}

func markChannelRouteUsed(c *gin.Context, rule operation_setting.ChannelRouteRule, modelName string, usingGroup string, selectedGroup string, channelID int, requestPath string, estimatedTokens int, matchedTier string) {
	if c == nil {
		return
	}
	logInfo := gin.H{
		"rule_name":      strings.TrimSpace(rule.Name),
		"model":          modelName,
		"request_path":   requestPath,
		"using_group":    usingGroup,
		"selected_group": selectedGroup,
		"channel_ids":    rule.ChannelIDs,
		"channel_id":     channelID,
		"strict":         rule.Strict,
	}
	if matchedTier != "" {
		logInfo["matched_tier"] = matchedTier
	}
	if len(rule.RouteTiers) > 0 {
		logInfo["estimated_tokens"] = estimatedTokens
		logInfo["route_tiers"] = len(rule.RouteTiers)
	}
	c.Set(ginKeyChannelRouteLogInfo, logInfo)
}

func markChannelRouteExhausted(c *gin.Context, rule operation_setting.ChannelRouteRule, modelName string, usingGroup string, requestPath string, estimatedTokens int, matchedTier string) {
	if c == nil {
		return
	}
	logInfo := gin.H{
		"rule_name":    strings.TrimSpace(rule.Name),
		"model":        modelName,
		"request_path": requestPath,
		"using_group":  usingGroup,
		"channel_ids":  rule.ChannelIDs,
		"strict":       rule.Strict,
		"exhausted":    true,
	}
	if matchedTier != "" {
		logInfo["matched_tier"] = matchedTier
	}
	if len(rule.RouteTiers) > 0 {
		logInfo["estimated_tokens"] = estimatedTokens
		logInfo["route_tiers"] = len(rule.RouteTiers)
	}
	c.Set(ginKeyChannelRouteLogInfo, logInfo)
}

func AppendChannelRouteAdminInfo(c *gin.Context, adminInfo map[string]interface{}) {
	if c == nil || adminInfo == nil {
		return
	}
	if anyInfo, ok := c.Get(ginKeyChannelRouteLogInfo); ok && anyInfo != nil {
		adminInfo["channel_route"] = anyInfo
	}
}
