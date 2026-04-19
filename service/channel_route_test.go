package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
)

func TestChannelRouteMatchAnyRegex(t *testing.T) {
	if !channelRouteMatchAnyRegex([]string{"^/v1/messages$"}, "/v1/messages") {
		t.Fatalf("expected path regex to match")
	}
	if channelRouteMatchAnyRegex([]string{"^/v1/messages$"}, "/v1/chat/completions") {
		t.Fatalf("expected path regex not to match")
	}
	if !channelRouteMatchAnyRegex([]string{"^Qwen3\\.5-35B-A3B$"}, "Qwen3.5-35B-A3B") {
		t.Fatalf("expected model regex to match")
	}
}

func TestCollectRouteCandidatesForGroupDeduplicates(t *testing.T) {
	candidates := collectRouteCandidatesForGroup("", "model", []int{1, 1, 2})
	if len(candidates) != 0 {
		t.Fatalf("expected no candidates for empty group")
	}
}

func TestGetChannelRouteMatchGroupPrefersUsingGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	common.SetContextKey(ctx, constant.ContextKeyUsingGroup, "vip")
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")

	group := getChannelRouteMatchGroup(&RetryParam{
		Ctx:        ctx,
		TokenGroup: "default",
		ModelName:  "test-model",
		Retry:      common.GetPointer(0),
	})
	if group != "vip" {
		t.Fatalf("expected using group, got %q", group)
	}
}

func TestGetChannelRouteMatchGroupFallsBackToUserGroupWhenAuto(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	common.SetContextKey(ctx, constant.ContextKeyUsingGroup, "auto")
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "vip")

	group := getChannelRouteMatchGroup(&RetryParam{
		Ctx:        ctx,
		TokenGroup: "auto",
		ModelName:  "test-model",
		Retry:      common.GetPointer(0),
	})
	if group != "vip" {
		t.Fatalf("expected user group fallback, got %q", group)
	}
}
