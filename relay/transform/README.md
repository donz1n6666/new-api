# Transform Package - Pure JSON Format Conversion

## Overview

The `relay/transform` package implements a **pure JSON manipulation approach** for format conversion between different AI provider APIs. It's inspired by cc-switch's design, offering several key advantages over the traditional DTO-based approach.

## Key Design Principles (from cc-switch)

### 1. Pure JSON Manipulation (No DTO Dependency)

Instead of marshaling/unmarshaling through structs (DTOs), this package operates directly on `map[string]any` and JSON bytes. This offers:

- **Zero allocation overhead** for struct instantiation
- **No lost fields** during conversion (fields unknown to structs are preserved)
- **Flexibility** to handle edge cases without modifying struct definitions
- **Forward compatibility** with new API features without code changes

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

## API Reference

### Request Transformation

```go
// Convert OpenAI Chat request to Claude Messages format
func RequestOpenAIToClaude(body []byte, flags TransformFlags) ([]byte, error)
```

### Response Transformation

```go
// Convert Claude streaming response to OpenAI format
func StreamResponseClaudeToOpenAI(ctx context.Context, body []byte) ([]byte, error)

// Convert Claude non-streaming response to OpenAI format
func ResponseClaudeToOpenAI(body []byte) ([]byte, error)
```

### Helper Functions

```go
// Auto-detect flags from model name
func GetModelFlags(modelName string) TransformFlags

// Create adaptor for integration with existing relay system
func NewAdaptor() *Adaptor
```

## Comparison: DTO vs Pure JSON

| Aspect | DTO Approach | Pure JSON Approach |
|--------|-------------|-------------------|
| **Type Safety** | High (compile-time) | Medium (runtime) |
| **Flexibility** | Low (requires struct changes) | High |
| **Performance** | More allocations | Fewer allocations |
| **Unknown Fields** | Lost | Preserved |
| **Maintenance** | High (duplicate structs) | Low |
| **Error Location** | Precise | Requires explicit checks |

## Usage Example

```go
import "github.com/QuantumNous/new-api/relay/transform"

// 1. Get request body
body, _ := io.ReadAll(c.Request.Body)

// 2. Auto-detect transformation flags
flags := transform.GetModelFlags(modelName)

// 3. Transform request
claudeBody, err := transform.RequestOpenAIToClaude(body, flags)
if err != nil {
    // Handle error
}

// 4. Forward request to Claude API...

// 5. Transform response back
openAIResponse, err := transform.ResponseClaudeToOpenAI(claudeResponseBody)
```

## Testing

```bash
go test ./relay/transform/... -v
```

Test coverage includes:
- Basic request transformation
- System message handling
- Tool call transformation
- Reasoning effort mapping
- Codex OAuth special handling
- O-series model token adaptation
- Response transformation (streaming + non-streaming)

## Future Enhancements

1. **OpenAI Responses API support** - Add `/v1/responses` format conversion
2. **Gemini format support** - Bidirectional conversion for Gemini API
3. **AWS Bedrock variations** - Special handling for Bedrock's Claude variant
4. **Cache control field merging** - Intelligent `cache_control` management
5. **More streaming edge cases** - Handle interleaved content types

## Design Philosophy

This package follows cc-switch's philosophy: **"Don't fight the JSON"**. Instead of forcing APIs into rigid struct hierarchies, work with the natural shape of JSON data. This reduces boilerplate, preserves forward compatibility, and makes it easier to handle the idiosyncrasies of different AI providers.

> Inspired by: cc-switch (https://github.com/cc-switch/cc-switch) internal transform module
