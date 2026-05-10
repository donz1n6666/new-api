package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetRatioConfig(c *gin.Context) {
	if !ratio_setting.IsExposeRatioEnabled() {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "倍率配置接口未启用",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    ratio_setting.GetExposedData(),
	})
}

// SyncGroupPricingRequest 同步分组定价配置请求
type SyncGroupPricingRequest struct {
	SourceGroup  string   `json:"source_group"`
	TargetGroups []string `json:"target_groups"`
	ModelNames   []string `json:"model_names,omitempty"` // 可选：只同步指定的模型
	FromGlobal   bool     `json:"from_global,omitempty"` // 是否从全局配置同步
}

// SyncGroupPricing 同步分组定价配置
func SyncGroupPricing(c *gin.Context) {
	var req SyncGroupPricingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}

	if req.SourceGroup == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "源分组不能为空",
		})
		return
	}

	if len(req.TargetGroups) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "目标分组不能为空",
		})
		return
	}

	// 检查源分组是否有配置（从全局同步时跳过此检查）
	if !req.FromGlobal && req.SourceGroup != "global" {
		sourceHasConfig := false
		if _, ok := ratio_setting.GetGroupModelPriceCopy()[req.SourceGroup]; ok {
			sourceHasConfig = true
		}
		if _, ok := ratio_setting.GetGroupModelRatioCopy()[req.SourceGroup]; ok {
			sourceHasConfig = true
		}
		if _, ok := ratio_setting.GetGroupBillingModeCopy()[req.SourceGroup]; ok {
			sourceHasConfig = true
		}

		if !sourceHasConfig {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "源分组没有定价配置",
			})
			return
		}
	}

	// 执行同步
	var err error
	if req.FromGlobal {
		// 从全局配置同步到目标分组
		err = ratio_setting.SyncFromGlobalToGroups(req.TargetGroups, req.ModelNames)
	} else if req.SourceGroup == "global" {
		// 从全局配置同步到目标分组
		err = ratio_setting.SyncFromGlobalToGroups(req.TargetGroups, req.ModelNames)
	} else if len(req.ModelNames) > 0 {
		// 只同步指定的模型
		// 检查源分组是否有配置，如果没有则使用全局配置
		sourceHasConfig := false
		if _, ok := ratio_setting.GetGroupModelPriceCopy()[req.SourceGroup]; ok {
			sourceHasConfig = true
		}
		if _, ok := ratio_setting.GetGroupModelRatioCopy()[req.SourceGroup]; ok {
			sourceHasConfig = true
		}
		if _, ok := ratio_setting.GetGroupBillingModeCopy()[req.SourceGroup]; ok {
			sourceHasConfig = true
		}

		if sourceHasConfig {
			// 源分组有配置，从源分组同步
			err = ratio_setting.SyncGroupPricingForModels(req.SourceGroup, req.TargetGroups, req.ModelNames)
		} else {
			// 源分组没有配置，从全局配置同步
			err = ratio_setting.SyncFromGlobalToGroups(req.TargetGroups, req.ModelNames)
		}
	} else {
		// 同步全部配置
		err = ratio_setting.SyncGroupPricing(req.SourceGroup, req.TargetGroups)
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "同步失败: " + err.Error(),
		})
		return
	}

	// 保存到数据库
	saveGroupPricingToDB()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "同步成功",
	})
}

// saveGroupPricingToDB 保存分组定价配置到数据库
func saveGroupPricingToDB() {
	// 这里需要调用 model.UpdateOption 来保存各个配置
	// 为了简化，我们可以直接调用各个配置的保存方法
	model.UpdateOption("GroupModelPrice", ratio_setting.GroupModelPrice2JSONString())
	model.UpdateOption("GroupModelRatio", ratio_setting.GroupModelRatio2JSONString())
	model.UpdateOption("GroupCompletionRatio", ratio_setting.GroupCompletionRatio2JSONString())
	model.UpdateOption("GroupCacheRatio", ratio_setting.GroupCacheRatio2JSONString())
	model.UpdateOption("GroupCreateCacheRatio", ratio_setting.GroupCreateCacheRatio2JSONString())
	model.UpdateOption("GroupImageRatio", ratio_setting.GroupImageRatio2JSONString())
	model.UpdateOption("GroupAudioRatio", ratio_setting.GroupAudioRatio2JSONString())
	model.UpdateOption("GroupAudioCompletionRatio", ratio_setting.GroupAudioCompletionRatio2JSONString())
	model.UpdateOption("GroupBillingMode", ratio_setting.GroupBillingMode2JSONString())
	model.UpdateOption("GroupBillingExpr", ratio_setting.GroupBillingExpr2JSONString())
}
