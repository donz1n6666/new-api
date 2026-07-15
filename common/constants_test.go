package common

import (
	"sync"
	"testing"
)

func TestGlobalRecordIpLogEnabled(t *testing.T) {
	originalOption := globalRecordIpLogEnabled.Load()
	originalEnv := globalRecordIpLogEnvEnabled.Load()
	t.Cleanup(func() {
		globalRecordIpLogEnabled.Store(originalOption)
		globalRecordIpLogEnvEnabled.Store(originalEnv)
	})

	globalRecordIpLogEnabled.Store(false)
	globalRecordIpLogEnvEnabled.Store(false)
	if IsGlobalRecordIpLogEnabled() {
		t.Fatal("IP log recording should be disabled when both sources are false")
	}

	SetGlobalRecordIpLogEnabled(true)
	if !IsGlobalRecordIpLogEnabled() {
		t.Fatal("option should enable IP log recording")
	}

	SetGlobalRecordIpLogEnabled(false)
	SetGlobalRecordIpLogEnvEnabled(true)
	if !IsGlobalRecordIpLogEnabled() {
		t.Fatal("environment override should keep IP log recording enabled")
	}
	SetGlobalRecordIpLogEnvEnabled(false)
	if IsGlobalRecordIpLogEnabled() {
		t.Fatal("IP log recording should follow the environment override being disabled")
	}
}

func TestGlobalRecordUaLogEnabled(t *testing.T) {
	originalOption := globalRecordUaLogEnabled.Load()
	originalEnv := globalRecordUaLogEnvEnabled.Load()
	t.Cleanup(func() {
		globalRecordUaLogEnabled.Store(originalOption)
		globalRecordUaLogEnvEnabled.Store(originalEnv)
	})

	tests := []struct {
		name          string
		optionEnabled bool
		envEnabled    bool
		want          bool
	}{
		{name: "disabled", want: false},
		{name: "option enabled", optionEnabled: true, want: true},
		{name: "environment enabled", envEnabled: true, want: true},
		{name: "both enabled", optionEnabled: true, envEnabled: true, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			globalRecordUaLogEnabled.Store(tt.optionEnabled)
			globalRecordUaLogEnvEnabled.Store(tt.envEnabled)
			if got := IsGlobalRecordUaLogEnabled(); got != tt.want {
				t.Fatalf("IsGlobalRecordUaLogEnabled() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSetGlobalRecordUaLogEnvEnabled(t *testing.T) {
	originalOption := globalRecordUaLogEnabled.Load()
	originalEnv := globalRecordUaLogEnvEnabled.Load()
	t.Cleanup(func() {
		globalRecordUaLogEnabled.Store(originalOption)
		globalRecordUaLogEnvEnabled.Store(originalEnv)
	})

	globalRecordUaLogEnabled.Store(false)
	globalRecordUaLogEnvEnabled.Store(false)
	SetGlobalRecordUaLogEnvEnabled(true)

	if globalRecordUaLogEnabled.Load() || !globalRecordUaLogEnvEnabled.Load() || !IsGlobalRecordUaLogEnabled() {
		t.Fatal("environment override must enable the effective value without mutating the option source")
	}
	SetGlobalRecordUaLogEnvEnabled(false)
	if IsGlobalRecordUaLogEnabled() {
		t.Fatal("UA log recording should follow the environment override being disabled")
	}
}

func TestGlobalRecordLogSwitchesConcurrent(t *testing.T) {
	originalIp := globalRecordIpLogEnabled.Load()
	originalUa := globalRecordUaLogEnabled.Load()
	t.Cleanup(func() {
		globalRecordIpLogEnabled.Store(originalIp)
		globalRecordUaLogEnabled.Store(originalUa)
	})

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(offset int) {
			defer wg.Done()
			for value := offset; value < 1000; value += 8 {
				enabled := value%2 == 0
				SetGlobalRecordIpLogEnabled(enabled)
				SetGlobalRecordUaLogEnabled(enabled)
				_ = IsGlobalRecordIpLogEnabled()
				_ = IsGlobalRecordUaLogEnabled()
			}
		}(i)
	}
	wg.Wait()
}
