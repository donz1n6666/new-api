package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// checkModelEndpointProtection 检查模型端点保护
// 返回 nil 表示放行，返回 error 表示拦截
func checkModelEndpointProtection(c *gin.Context, modelName string, requestPath string) *types.NewAPIError {
	settings := model_setting.GetGlobalSettings()

	// 功能关闭，直接放行
	if !settings.ModelEndpointProtectEnabled {
		return nil
	}

	// 获取模型元数据
	modelMeta := getModelMeta(modelName)
	if modelMeta == nil {
		// 模型未在模型管理中配置，放行
		return nil
	}

	endpoints := strings.TrimSpace(modelMeta.Endpoints)

	// Endpoints 为空或 "*"，放行
	if endpoints == "" || endpoints == "*" {
		return nil
	}

	// 解析 Endpoints
	allowedEndpoints := parseEndpoints(endpoints)

	// 检查请求路径是否匹配
	if isEndpointAllowed(requestPath, allowedEndpoints) {
		return nil
	}

	// 不匹配，记录日志
	logger.LogWarn(c.Request.Context(), fmt.Sprintf("Model endpoint protection: model=%s, path=%s, allowed=%v",
		modelName, requestPath, allowedEndpoints))

	// 返回友好错误
	errMsg := fmt.Sprintf("模型 %s 不支持当前请求路径 %s，请使用正确的端点", modelName, requestPath)
	return types.NewError(errors.New(errMsg), types.ErrorCodeInvalidRequest, types.ErrOptionWithStatusCode(http.StatusForbidden))
}

// getModelMeta 获取模型元数据（从缓存或数据库）
func getModelMeta(modelName string) *model.Model {
	if modelName == "" {
		return nil
	}

	// 先尝试精确匹配
	var modelMeta model.Model
	err := model.DB.Where("model_name = ?", modelName).First(&modelMeta).Error
	if err == nil {
		return &modelMeta
	}

	// 尝试前缀匹配（支持通配符）
	var allModels []model.Model
	model.DB.Find(&allModels)

	for _, m := range allModels {
		switch m.NameRule {
		case model.NameRuleExact:
			if m.ModelName == modelName {
				return &m
			}
		case model.NameRulePrefix:
			if strings.HasPrefix(modelName, m.ModelName) {
				return &m
			}
		case model.NameRuleSuffix:
			if strings.HasSuffix(modelName, m.ModelName) {
				return &m
			}
		case model.NameRuleContains:
			if strings.Contains(modelName, m.ModelName) {
				return &m
			}
		}
	}

	return nil
}

// parseEndpoints 解析 Endpoints 配置
// 支持逗号分隔格式和 JSON 格式
func parseEndpoints(endpoints string) []string {
	// 尝试作为 JSON 解析
	if strings.HasPrefix(endpoints, "{") {
		return parseJSONEndpoints(endpoints)
	}

	// 逗号分隔格式
	parts := strings.Split(endpoints, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" && part != "*" {
			result = append(result, part)
		}
	}
	return result
}

// parseJSONEndpoints 解析 JSON 格式的 Endpoints
// 支持两种格式：
// 1. 简单格式: {"/v1/chat/completions": {...}}
// 2. 嵌套格式: {"chat": {"path": "/v1/chat/completions", "method": "POST"}}
func parseJSONEndpoints(endpoints string) []string {
	var raw map[string]interface{}
	if err := common.Unmarshal([]byte(endpoints), &raw); err != nil {
		// JSON 解析失败，返回空
		return nil
	}

	result := make([]string, 0, len(raw))
	for key, value := range raw {
		// 尝试从嵌套对象中提取 path 字段
		if obj, ok := value.(map[string]interface{}); ok {
			if path, exists := obj["path"]; exists {
				if pathStr, ok := path.(string); ok {
					pathStr = strings.TrimSpace(pathStr)
					if pathStr != "" {
						result = append(result, pathStr)
						continue
					}
				}
			}
		}
		// 否则使用顶层 key 作为端点
		key = strings.TrimSpace(key)
		if key != "" {
			result = append(result, key)
		}
	}
	return result
}

// isEndpointAllowed 检查请求路径是否在允许的端点列表中
func isEndpointAllowed(requestPath string, allowedEndpoints []string) bool {
	if len(allowedEndpoints) == 0 {
		return true
	}

	// 标准化路径
	requestPath = strings.TrimSuffix(requestPath, "/")

	for _, endpoint := range allowedEndpoints {
		endpoint = strings.TrimSuffix(endpoint, "/")

		// 精确匹配
		if requestPath == endpoint {
			return true
		}

		// 前缀匹配（endpoint 以 / 结尾或请求路径以 endpoint 开头）
		if strings.HasSuffix(endpoint, "/") && strings.HasPrefix(requestPath, endpoint) {
			return true
		}
		if strings.HasPrefix(requestPath, endpoint+"/") {
			return true
		}
	}

	return false
}
