package model

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

func newLogTestContext(userAgent string) *gin.Context {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("User-Agent", userAgent)
	return &gin.Context{Request: request}
}

func TestGetRequestLogUaDisabled(t *testing.T) {
	original := common.IsGlobalRecordUaLogEnabled()
	t.Cleanup(func() {
		common.SetGlobalRecordUaLogEnvEnabled(false)
		common.SetGlobalRecordUaLogEnabled(original)
	})

	common.SetGlobalRecordUaLogEnvEnabled(false)
	common.SetGlobalRecordUaLogEnabled(false)
	if got := getRequestLogUa(newLogTestContext("test-agent")); got != "" {
		t.Fatalf("getRequestLogUa() = %q when disabled, want empty string", got)
	}
}

func TestGetRequestLogUaTruncatesByRune(t *testing.T) {
	original := common.IsGlobalRecordUaLogEnabled()
	t.Cleanup(func() {
		common.SetGlobalRecordUaLogEnvEnabled(false)
		common.SetGlobalRecordUaLogEnabled(original)
	})

	common.SetGlobalRecordUaLogEnvEnabled(false)
	common.SetGlobalRecordUaLogEnabled(true)

	tests := []struct {
		name      string
		userAgent string
		want      string
	}{
		{name: "empty", userAgent: "", want: ""},
		{name: "ascii exact limit", userAgent: strings.Repeat("a", maxLogUaLength), want: strings.Repeat("a", maxLogUaLength)},
		{name: "ascii over limit", userAgent: strings.Repeat("a", maxLogUaLength+1), want: strings.Repeat("a", maxLogUaLength)},
		{name: "unicode over limit", userAgent: strings.Repeat("界", maxLogUaLength+1), want: strings.Repeat("界", maxLogUaLength)},
		{name: "invalid UTF-8", userAgent: "agent-\xff", want: "agent-�"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getRequestLogUa(newLogTestContext(tt.userAgent))
			if got != tt.want {
				t.Fatalf("getRequestLogUa() rune length = %d, want %d", utf8.RuneCountInString(got), utf8.RuneCountInString(tt.want))
			}
		})
	}
}

func TestRecordRequestLogsPersistSanitizedUa(t *testing.T) {
	truncateTables(t)
	originalUa := common.IsGlobalRecordUaLogEnabled()
	originalExport := common.DataExportEnabled
	t.Cleanup(func() {
		common.SetGlobalRecordUaLogEnvEnabled(false)
		common.SetGlobalRecordUaLogEnabled(originalUa)
		common.DataExportEnabled = originalExport
	})

	common.SetGlobalRecordUaLogEnvEnabled(false)
	common.SetGlobalRecordUaLogEnabled(true)
	common.DataExportEnabled = false
	context := newLogTestContext("client-\xff")
	context.Set("username", "log-user")

	RecordConsumeLog(context, 1001, RecordConsumeLogParams{ModelName: "test-model"})
	RecordErrorLog(context, 1001, 0, "test-model", "", "upstream error", 0, 1, false, "default", nil)

	var logs []Log
	if err := LOG_DB.Where("user_id = ?", 1001).Order("id ASC").Find(&logs).Error; err != nil {
		t.Fatalf("query request logs: %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("persisted logs = %d, want 2", len(logs))
	}
	for _, log := range logs {
		if log.Ua != "client-�" {
			t.Fatalf("log type %d UA = %q, want sanitized value", log.Type, log.Ua)
		}
	}
	if !LOG_DB.Migrator().HasColumn(&Log{}, "ua") {
		t.Fatal("logs table is missing the ua column after AutoMigrate")
	}
}
