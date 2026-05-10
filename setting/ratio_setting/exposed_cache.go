package ratio_setting

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

const exposedDataTTL = 30 * time.Second

type exposedCache struct {
	data      gin.H
	expiresAt time.Time
}

var (
	exposedData atomic.Value
	rebuildMu   sync.Mutex
)

func InvalidateExposedDataCache() {
	exposedData.Store((*exposedCache)(nil))
}

func cloneGinH(src gin.H) gin.H {
	dst := make(gin.H, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func GetExposedData() gin.H {
	if c, ok := exposedData.Load().(*exposedCache); ok && c != nil && time.Now().Before(c.expiresAt) {
		return cloneGinH(c.data)
	}
	rebuildMu.Lock()
	defer rebuildMu.Unlock()
	if c, ok := exposedData.Load().(*exposedCache); ok && c != nil && time.Now().Before(c.expiresAt) {
		return cloneGinH(c.data)
	}
	newData := gin.H{
		"model_ratio":        GetModelRatioCopy(),
		"completion_ratio":   GetCompletionRatioCopy(),
		"cache_ratio":        GetCacheRatioCopy(),
		"create_cache_ratio": GetCreateCacheRatioCopy(),
		"model_price":        GetModelPriceCopy(),
		// 分组级别定价配置
		"group_model_price":            GetGroupModelPriceCopy(),
		"group_model_ratio":            GetGroupModelRatioCopy(),
		"group_completion_ratio":       GetGroupCompletionRatioCopy(),
		"group_cache_ratio":            GetGroupCacheRatioCopy(),
		"group_create_cache_ratio":     GetGroupCreateCacheRatioCopy(),
		"group_image_ratio":            GetGroupImageRatioCopy(),
		"group_audio_ratio":            GetGroupAudioRatioCopy(),
		"group_audio_completion_ratio": GetGroupAudioCompletionRatioCopy(),
		"group_billing_mode":           GetGroupBillingModeCopy(),
		"group_billing_expr":           GetGroupBillingExprCopy(),
	}
	exposedData.Store(&exposedCache{
		data:      newData,
		expiresAt: time.Now().Add(exposedDataTTL),
	})
	return cloneGinH(newData)
}
