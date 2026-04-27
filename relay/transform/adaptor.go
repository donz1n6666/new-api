package transform

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// Adaptor provides integration between new-api's existing relay system
// and the new pure JSON transform system.
type Adaptor struct {
	flags TransformFlags
}

// NewAdaptor creates a new transform adaptor with default flags
func NewAdaptor() *Adaptor {
	return &Adaptor{}
}

// WithCodexOAuth enables Codex OAuth special handling
func (a *Adaptor) WithCodexOAuth(fastMode bool) *Adaptor {
	a.flags.IsCodexOAuth = true
	a.flags.CodexFastMode = fastMode
	return a
}

// WithOSeriesMode enables o-series model token handling
func (a *Adaptor) WithOSeriesMode() *Adaptor {
	a.flags.OSeriesMode = true
	return a
}

// WithCacheControlPreservation preserves cache_control fields
func (a *Adaptor) WithCacheControlPreservation() *Adaptor {
	a.flags.PreserveCacheControl = true
	return a
}

// GetModelFlags returns TransformFlags based on model name
func GetModelFlags(modelName string) TransformFlags {
	flags := TransformFlags{}

	// O-series model detection
	oSeriesPrefixes := []string{"o1-", "o3-", "o4-", "gpt-4o"}
	for _, prefix := range oSeriesPrefixes {
		if strings.HasPrefix(modelName, prefix) {
			flags.OSeriesMode = true
			break
		}
	}

	// Codex detection
	codexPrefixes := []string{"codex-", "gpt-4.5"}
	for _, prefix := range codexPrefixes {
		if strings.HasPrefix(modelName, prefix) {
			flags.IsCodexOAuth = true
			flags.CodexFastMode = strings.Contains(modelName, "fast")
			break
		}
	}

	return flags
}

// ShouldUseTransform returns whether the new transform system should be used
// This can be controlled via channel settings or feature flags
func ShouldUseTransform(ctx *gin.Context) bool {
	// Can be controlled via channel settings or environment variables
	// For now, return true to enable by default
	return true
}
