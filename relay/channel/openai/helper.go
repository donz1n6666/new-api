package openai

import (
	"encoding/json"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/samber/lo"
	"github.com/tidwall/gjson"

	"github.com/gin-gonic/gin"
)

// 辅助函数
func HandleStreamFormat(c *gin.Context, info *relaycommon.RelayInfo, data string, forceFormat bool, thinkToContent bool) error {
	info.SendResponseCount++

	switch info.RelayFormat {
	case types.RelayFormatOpenAI:
		return sendStreamData(c, info, data, forceFormat, thinkToContent)
	case types.RelayFormatClaude:
		return handleClaudeFormat(c, data, info)
	case types.RelayFormatGemini:
		return handleGeminiFormat(c, data, info)
	}
	return nil
}

func handleClaudeFormat(c *gin.Context, data string, info *relaycommon.RelayInfo) error {
	// 纯 JSON 方式处理流式转换，跳过 DTO 中间层
	// 使用 info.ClaudeConvertInfo 跟踪状态

	// 提取 delta 和 finish_reason
	choices := gjson.Get(data, "choices")
	if !choices.Exists() || !choices.IsArray() || len(choices.Array()) == 0 {
		return nil
	}
	choice := choices.Array()[0]
	delta := choice.Get("delta")
	finishReason := choice.Get("finish_reason").String()

	// 提取 usage
	if usage := gjson.Get(data, "usage"); usage.Exists() {
		info.ClaudeConvertInfo.Usage = &dto.Usage{}
		_ = json.Unmarshal([]byte(usage.Raw), info.ClaudeConvertInfo.Usage)
	}

	// message_start — 首个 chunk 发送（必须）
	if !info.ClaudeConvertInfo.MessageStartSent {
		responseID := gjson.Get(data, "id").String()
		model := gjson.Get(data, "model").String()
		if responseID == "" {
			responseID = "msg_" + common.GetUUID()
		}
		if model == "" {
			model = info.UpstreamModelName
		}
		messageStart := map[string]any{
			"type": "message_start",
			"message": map[string]any{
				"id":      responseID,
				"type":    "message",
				"role":    "assistant",
				"model":   model,
				"content": []any{},
				"usage": map[string]any{
					"input_tokens":  0,
					"output_tokens": 0,
				},
			},
		}
		b, _ := json.Marshal(messageStart)
		c.Render(-1, common.CustomEvent{Data: "data: " + string(b)})
		_ = helper.FlushWriter(c)
		info.ClaudeConvertInfo.MessageStartSent = true
	}

	// 发送 content_block_stop（切换 block 类型时）
	sendStopBlock := func() {
		if info.ClaudeConvertInfo.LastMessagesType == "" || info.ClaudeConvertInfo.LastMessagesType == relaycommon.LastMessageTypeNone {
			return
		}
		stopData := map[string]any{
			"type":  "content_block_stop",
			"index": info.ClaudeConvertInfo.Index,
		}
		b, _ := json.Marshal(stopData)
		c.Render(-1, common.CustomEvent{Data: "data: " + string(b)})
		_ = helper.FlushWriter(c)
	}

	// 处理 delta 内容
	if delta.Exists() {
		// reasoning_content delta（推理过程）— 优先处理，保持 thinking 在前
		if reasoning := delta.Get("reasoning_content").String(); reasoning != "" {
			// 当前是其他类型 block → 先 stop
			if info.ClaudeConvertInfo.LastMessagesType != "" &&
				info.ClaudeConvertInfo.LastMessagesType != relaycommon.LastMessageTypeThinking {
				sendStopBlock()
				info.ClaudeConvertInfo.Index++
			}
			// 尚未开始 thinking block → 发送 content_block_start
			if info.ClaudeConvertInfo.LastMessagesType != relaycommon.LastMessageTypeThinking {
				startData := map[string]any{
					"type":  "content_block_start",
					"index": info.ClaudeConvertInfo.Index,
					"content_block": map[string]any{
						"type":      "thinking",
						"thinking":  "",
						"signature": "",
					},
				}
				b, _ := json.Marshal(startData)
				c.Render(-1, common.CustomEvent{Data: "data: " + string(b)})
				_ = helper.FlushWriter(c)
				info.ClaudeConvertInfo.LastMessagesType = relaycommon.LastMessageTypeThinking
			}

			claudeData := map[string]any{
				"type":  "content_block_delta",
				"index": info.ClaudeConvertInfo.Index,
				"delta": map[string]any{
					"type":     "thinking_delta",
					"thinking": reasoning,
				},
			}
			b, _ := json.Marshal(claudeData)
			c.Render(-1, common.CustomEvent{Data: "data: " + string(b)})
			_ = helper.FlushWriter(c)
		}

		// content delta（文本）
		if content := delta.Get("content").String(); content != "" {
			// 当前是其他类型 block → 先 stop
			if info.ClaudeConvertInfo.LastMessagesType != "" &&
				info.ClaudeConvertInfo.LastMessagesType != relaycommon.LastMessageTypeText {
				sendStopBlock()
				info.ClaudeConvertInfo.Index++
			}
			// 尚未开始 text block → 发送 content_block_start
			if info.ClaudeConvertInfo.LastMessagesType != relaycommon.LastMessageTypeText {
				startData := map[string]any{
					"type":  "content_block_start",
					"index": info.ClaudeConvertInfo.Index,
					"content_block": map[string]any{
						"type": "text",
						"text": "",
					},
				}
				b, _ := json.Marshal(startData)
				c.Render(-1, common.CustomEvent{Data: "data: " + string(b)})
				_ = helper.FlushWriter(c)
				info.ClaudeConvertInfo.LastMessagesType = relaycommon.LastMessageTypeText
			}

			claudeData := map[string]any{
				"type":  "content_block_delta",
				"index": info.ClaudeConvertInfo.Index,
				"delta": map[string]any{
					"type": "text_delta",
					"text": content,
				},
			}
			b, _ := json.Marshal(claudeData)
			c.Render(-1, common.CustomEvent{Data: "data: " + string(b)})
			_ = helper.FlushWriter(c)
		}

		// tool_calls delta
		if toolCalls := delta.Get("tool_calls"); toolCalls.Exists() && toolCalls.IsArray() {
			// 当前是 text/thinking block → 先 stop
			if info.ClaudeConvertInfo.LastMessagesType != "" &&
				info.ClaudeConvertInfo.LastMessagesType != relaycommon.LastMessageTypeTools {
				sendStopBlock()
				info.ClaudeConvertInfo.Index++
				info.ClaudeConvertInfo.LastMessagesType = relaycommon.LastMessageTypeNone
			}

			for _, tc := range toolCalls.Array() {
				name := tc.Get("function.name").String()
				args := tc.Get("function.arguments").String()

				if name != "" {
					// tool_use content_block_start
					claudeData := map[string]any{
						"type":  "content_block_start",
						"index": info.ClaudeConvertInfo.ToolCallBaseIndex,
						"content_block": map[string]any{
							"type":  "tool_use",
							"id":    tc.Get("id").String(),
							"name":  name,
							"input": map[string]any{},
						},
					}
					b, _ := json.Marshal(claudeData)
					c.Render(-1, common.CustomEvent{Data: "data: " + string(b)})
					_ = helper.FlushWriter(c)
							info.ClaudeConvertInfo.LastMessagesType = relaycommon.LastMessageTypeTools
				}
				if args != "" {
					// input_json_delta
					claudeData := map[string]any{
						"type":  "content_block_delta",
						"index": info.ClaudeConvertInfo.ToolCallBaseIndex,
						"delta": map[string]any{
							"type":         "input_json_delta",
							"partial_json": args,
						},
					}
					b, _ := json.Marshal(claudeData)
					c.Render(-1, common.CustomEvent{Data: "data: " + string(b)})
					_ = helper.FlushWriter(c)
						}
				// 有新 tool_call id 时递增计数
				if tc.Get("id").String() != "" {
					info.ClaudeConvertInfo.ToolCallBaseIndex++
				}
			}
		}
	}

	// finish_reason — 最后一个 chunk
	if finishReason != "" {
		info.ClaudeConvertInfo.Done = true
		info.ClaudeConvertInfo.FinishReason = finishReason
	}

	return nil
}

func handleGeminiFormat(c *gin.Context, data string, info *relaycommon.RelayInfo) error {
	var streamResponse dto.ChatCompletionsStreamResponse
	if err := common.Unmarshal(common.StringToByteSlice(data), &streamResponse); err != nil {
		logger.LogError(c, "failed to unmarshal stream response: "+err.Error())
		return err
	}

	geminiResponse := service.StreamResponseOpenAI2Gemini(&streamResponse, info)

	// 如果返回 nil，表示没有实际内容，跳过发送
	if geminiResponse == nil {
		return nil
	}

	geminiResponseStr, err := common.Marshal(geminiResponse)
	if err != nil {
		logger.LogError(c, "failed to marshal gemini response: "+err.Error())
		return err
	}

	// send gemini format response
	c.Render(-1, common.CustomEvent{Data: "data: " + string(geminiResponseStr)})
	_ = helper.FlushWriter(c)
	return nil
}

func ProcessStreamResponse(streamResponse dto.ChatCompletionsStreamResponse, responseTextBuilder *strings.Builder, toolCount *int) error {
	for _, choice := range streamResponse.Choices {
		responseTextBuilder.WriteString(choice.Delta.GetContentString())
		responseTextBuilder.WriteString(choice.Delta.GetReasoningContent())
		if choice.Delta.ToolCalls != nil {
			if len(choice.Delta.ToolCalls) > *toolCount {
				*toolCount = len(choice.Delta.ToolCalls)
			}
			for _, tool := range choice.Delta.ToolCalls {
				responseTextBuilder.WriteString(tool.Function.Name)
				responseTextBuilder.WriteString(tool.Function.Arguments)
			}
		}
	}
	return nil
}

func processTokens(relayMode int, streamItems []string, responseTextBuilder *strings.Builder, toolCount *int) error {
	streamResp := "[" + strings.Join(streamItems, ",") + "]"

	switch relayMode {
	case relayconstant.RelayModeChatCompletions:
		return processChatCompletions(streamResp, streamItems, responseTextBuilder, toolCount)
	case relayconstant.RelayModeCompletions:
		return processCompletions(streamResp, streamItems, responseTextBuilder)
	}
	return nil
}

func processChatCompletions(streamResp string, streamItems []string, responseTextBuilder *strings.Builder, toolCount *int) error {
	var streamResponses []dto.ChatCompletionsStreamResponse
	if err := json.Unmarshal(common.StringToByteSlice(streamResp), &streamResponses); err != nil {
		// 一次性解析失败，逐个解析
		common.SysLog("error unmarshalling stream response: " + err.Error())
		for _, item := range streamItems {
			var streamResponse dto.ChatCompletionsStreamResponse
			if err := json.Unmarshal(common.StringToByteSlice(item), &streamResponse); err != nil {
				return err
			}
			if err := ProcessStreamResponse(streamResponse, responseTextBuilder, toolCount); err != nil {
				common.SysLog("error processing stream response: " + err.Error())
			}
		}
		return nil
	}

	// 批量处理所有响应
	for _, streamResponse := range streamResponses {
		for _, choice := range streamResponse.Choices {
			responseTextBuilder.WriteString(choice.Delta.GetContentString())
			responseTextBuilder.WriteString(choice.Delta.GetReasoningContent())
			if choice.Delta.ToolCalls != nil {
				if len(choice.Delta.ToolCalls) > *toolCount {
					*toolCount = len(choice.Delta.ToolCalls)
				}
				for _, tool := range choice.Delta.ToolCalls {
					responseTextBuilder.WriteString(tool.Function.Name)
					responseTextBuilder.WriteString(tool.Function.Arguments)
				}
			}
		}
	}
	return nil
}

func processCompletions(streamResp string, streamItems []string, responseTextBuilder *strings.Builder) error {
	var streamResponses []dto.CompletionsStreamResponse
	if err := json.Unmarshal(common.StringToByteSlice(streamResp), &streamResponses); err != nil {
		// 一次性解析失败，逐个解析
		common.SysLog("error unmarshalling stream response: " + err.Error())
		for _, item := range streamItems {
			var streamResponse dto.CompletionsStreamResponse
			if err := json.Unmarshal(common.StringToByteSlice(item), &streamResponse); err != nil {
				continue
			}
			for _, choice := range streamResponse.Choices {
				responseTextBuilder.WriteString(choice.Text)
			}
		}
		return nil
	}

	// 批量处理所有响应
	for _, streamResponse := range streamResponses {
		for _, choice := range streamResponse.Choices {
			responseTextBuilder.WriteString(choice.Text)
		}
	}
	return nil
}

func handleLastResponse(lastStreamData string, responseId *string, createAt *int64,
	systemFingerprint *string, model *string, usage **dto.Usage,
	containStreamUsage *bool, info *relaycommon.RelayInfo,
	shouldSendLastResp *bool) error {

	var lastStreamResponse dto.ChatCompletionsStreamResponse
	if err := common.Unmarshal(common.StringToByteSlice(lastStreamData), &lastStreamResponse); err != nil {
		return err
	}

	*responseId = lastStreamResponse.Id
	*createAt = lastStreamResponse.Created
	*systemFingerprint = lastStreamResponse.GetSystemFingerprint()
	*model = lastStreamResponse.Model

	if service.ValidUsage(lastStreamResponse.Usage) {
		*containStreamUsage = true
		*usage = lastStreamResponse.Usage
		if !info.ShouldIncludeUsage {
			*shouldSendLastResp = lo.SomeBy(lastStreamResponse.Choices, func(choice dto.ChatCompletionsStreamResponseChoice) bool {
				return choice.Delta.GetContentString() != "" || choice.Delta.GetReasoningContent() != ""
			})
		}
	}

	return nil
}

func HandleFinalResponse(c *gin.Context, info *relaycommon.RelayInfo, lastStreamData string,
	responseId string, createAt int64, model string, systemFingerprint string,
	usage *dto.Usage, containStreamUsage bool) {

	switch info.RelayFormat {
	case types.RelayFormatOpenAI:
		if info.ShouldIncludeUsage && !containStreamUsage {
			response := helper.GenerateFinalUsageResponse(responseId, createAt, model, *usage)
			response.SetSystemFingerprint(systemFingerprint)
			helper.ObjectData(c, response)
		}
		helper.Done(c)

	case types.RelayFormatClaude:
		info.ClaudeConvertInfo.Usage = usage

		// close all open content blocks before message_delta
		if info.ClaudeConvertInfo.LastMessagesType != "" &&
			info.ClaudeConvertInfo.LastMessagesType != relaycommon.LastMessageTypeNone {
			switch info.ClaudeConvertInfo.LastMessagesType {
			case relaycommon.LastMessageTypeText, relaycommon.LastMessageTypeThinking:
				stopJSON, _ := json.Marshal(map[string]any{
					"type":  "content_block_stop",
					"index": info.ClaudeConvertInfo.Index,
				})
				c.Render(-1, common.CustomEvent{Data: "data: " + string(stopJSON)})
			case relaycommon.LastMessageTypeTools:
				base := info.ClaudeConvertInfo.ToolCallBaseIndex
				for offset := 0; offset <= info.ClaudeConvertInfo.ToolCallMaxIndexOffset; offset++ {
					stopJSON, _ := json.Marshal(map[string]any{
						"type":  "content_block_stop",
						"index": base + offset,
					})
					c.Render(-1, common.CustomEvent{Data: "data: " + string(stopJSON)})
				}
			}
		}

		if info.ShouldIncludeUsage && usage != nil {
			finishReason := "end_turn"
			if info.ClaudeConvertInfo.LastMessagesType == relaycommon.LastMessageTypeTools {
				finishReason = "tool_use"
			}
			usageJSON, _ := json.Marshal(map[string]any{
				"input_tokens":                usage.PromptTokens,
				"output_tokens":               usage.CompletionTokens,
				"cache_read_input_tokens":     usage.PromptTokensDetails.CachedTokens,
				"cache_creation_input_tokens": usage.PromptTokensDetails.CachedCreationTokens,
			})
			deltaJSON, _ := json.Marshal(map[string]any{
				"type":  "message_delta",
				"delta": map[string]any{"stop_reason": finishReason},
				"usage": json.RawMessage(usageJSON),
			})
			c.Render(-1, common.CustomEvent{Data: "data: " + string(deltaJSON)})
		}

		stopJSON, _ := json.Marshal(map[string]any{"type": "message_stop"})
		c.Render(-1, common.CustomEvent{Data: "data: " + string(stopJSON)})
		_ = helper.FlushWriter(c)
		info.ClaudeConvertInfo.Done = true

	case types.RelayFormatGemini:
		var streamResponse dto.ChatCompletionsStreamResponse
		if err := common.Unmarshal(common.StringToByteSlice(lastStreamData), &streamResponse); err != nil {
			common.SysLog("error unmarshalling stream response: " + err.Error())
			return
		}

		// 这里处理的是 openai 最后一个流响应，其 delta 为空，有 finish_reason 字段
		// 因此相比较于 google 官方的流响应，由 openai 转换而来会多一个 parts 为空，finishReason 为 STOP 的响应
		// 而包含最后一段文本输出的响应（倒数第二个）的 finishReason 为 null
		// 暂不知是否有程序会不兼容。

		geminiResponse := service.StreamResponseOpenAI2Gemini(&streamResponse, info)

		// openai 流响应开头的空数据
		if geminiResponse == nil {
			return
		}

		geminiResponseStr, err := common.Marshal(geminiResponse)
		if err != nil {
			common.SysLog("error marshalling gemini response: " + err.Error())
			return
		}

		// 发送最终的 Gemini 响应
		c.Render(-1, common.CustomEvent{Data: "data: " + string(geminiResponseStr)})
		_ = helper.FlushWriter(c)
	}
}

func sendResponsesStreamData(c *gin.Context, streamResponse dto.ResponsesStreamResponse, data string) {
	if data == "" {
		return
	}
	helper.ResponseChunkData(c, streamResponse, data)
}
