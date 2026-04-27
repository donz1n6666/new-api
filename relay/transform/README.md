# Transform Package - Pure JSON Format Conversion

## Overview

The `relay/transform` package implements a **pure JSON manipulation approach** for format conversion between different AI provider APIs. It's inspired by cc-switch's design, offering several key advantages over the traditional DTO-based approach.

This package is **already integrated** into the OpenAI channel adapter (`relay/channel/openai/adaptor.go:ConvertClaudeRequest`).

## Key Design Principles (from cc-switch)

### 1. Pure JSON Manipulation (No DTO Dependency)

Instead of marshaling/unmarshaling through structs (DTOs), this package operates directly on `map[string]any` and JSON bytes. This offers:

- **Zero field loss**: Unknown fields are preserved, not dropped
- **Forward compatibility**: New API features work without code changes
- **Flexibility**: Handle edge cases and special protocols easily

### 2. Provider-Specific Flags Mechanism

The `TransformFlags` struct enables special handling for specific providers:

```go
type TransformFlags struct {
    IsCodexOAuth         bool  // Codex OAuth protocol constraints
    CodexFastMode        bool  // service_tier=priority for Codex
    PreserveCacheControl bool  // Keep cache_control fields
    OSeriesMode          bool  // Use max_completion_tokens vs max_tokens
}
```

#### Codex OAuth Special Handling
When `IsCodexOAuth=true`:
- Removes `max_tokens` (protocol restriction)
- Removes `temperature`, `top_p` (protocol restriction)
- Sets `store=false`
- Adds `include: ["reasoning.encrypted_content"]`
- Forces `stream=true` (required by protocol)
- Sets `service_tier=priority` when `CodexFastMode=true`

### 3. Multi-Level Reasoning Effort Mapping

Intelligent resolution of reasoning parameters following priority order:

1. **Highest priority**: Explicit `output_config.effort` field
2. **Medium priority**: `thinking.type` + `budget_tokens`
   - `type=adaptive` → maps to `"xhigh"` effort
   - `type=enabled` + budget → uses threshold mapping
3. **Lowest priority**: `reasoning_effort` field

```go
func resolveReasoningEffort(req map[string]any) string {
    // Priority 1: output_config.effort
    // Priority 2: thinking.type + budget_tokens
    // Priority 3: reasoning_effort
}
```

### 4. O-Series Model Token Adaptation

OpenAI's o-series models use `max_completion_tokens` while regular models use `max_tokens`. The transform automatically selects the correct field based on `OSeriesMode` flag.

## Conversion Matrix

| ↓ Source / Target → | OpenAI Chat | Claude Messages |
|-------------------|-------------|----------------|
| **OpenAI Chat** | Native | `RequestOpenAIToClaude()`<br>`ResponseClaudeToOpenAI()`<br>`StreamResponseClaudeToOpenAI()` |
| **Claude Messages** | `RequestClaudeToOpenAI()`<br>`ResponseOpenAIToClaude()` | Native |

## Integration Status

### ✅ Already Integrated

1. **`ConvertClaudeRequest`** (`relay/channel/openai/adaptor.go`)
   - Uses `RequestClaudeToOpenAI()` for request conversion
   - Scenario: Client calls Claude API, upstream channel is OpenAI

### 📋 Can Be Extended To

1. **OpenAI → Claude request**: Client calls OpenAI, upstream is Claude
2. **Response conversion (both directions)**: Replace existing DTO-based conversion
3. **Streaming response conversion**: Use pure JSON SSE event transformation

## Usage Example

```go
import "github.com/QuantumNous/new-api/relay/transform"

// Convert request: Claude format → OpenAI format
flags := transform.GetModelFlags("gpt-4o")
openAIJSON, err := transform.RequestClaudeToOpenAI(claudeJSON, flags)

// Convert response: OpenAI format → Claude format  
claudeJSON, err := transform.ResponseOpenAIToClaude(openAIResponseJSON)
```

## Test Coverage

```
✓ RequestOpenAIToClaude - Basic
✓ RequestOpenAIToClaude - System messages
✓ RequestOpenAIToClaude - Tool calls
✓ RequestOpenAIToClaude - Reasoning effort (low/medium/high)
✓ RequestOpenAIToClaude - Codex OAuth special handling
✓ RequestOpenAIToClaude - O-series token adaptation

✓ RequestClaudeToOpenAI - Basic
✓ RequestClaudeToOpenAI - System prompt
✓ RequestClaudeToOpenAI - Tools
✓ RequestClaudeToOpenAI - Array system format

✓ ResponseClaudeToOpenAI - Basic / Tool calls
✓ ResponseOpenAIToClaude - Basic / Tool calls
✓ resolveReasoningEffort - All priority levels
✓ Stop reason mapping
✓ Usage field mapping
```

## Future Enhancements

1. **Streaming response conversion integration** - Replace DTO-based stream conversion
2. **Responses API format** - Add OpenAI Responses API format bidirectional conversion
3. **Gemini format support** - Add Gemini API bidirectional conversion
4. **AWS Bedrock variations** - Special handling for Bedrock's Claude variant
5. **Cache control field merging** - Intelligent `cache_control` management

## Design Philosophy

This package follows cc-switch's philosophy: **"Don't fight the JSON"**. Instead of forcing APIs into rigid struct hierarchies, work with the natural shape of JSON data. This reduces boilerplate, preserves forward compatibility, and makes it easier to handle the idiosyncrasies of different AI providers.

> Inspired by: cc-switch internal transform module