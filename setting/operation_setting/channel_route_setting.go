package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

type RouteTierCondition struct {
	Var   string `json:"var"`   // "len" | "p" | "c"
	Op    string `json:"op"`    // "<" | "<=" | ">" | ">="
	Value int    `json:"value"` // token count
}

type RouteTier struct {
	Conditions []RouteTierCondition `json:"conditions,omitempty"` // 0~2, AND
	ChannelIDs []int                `json:"channel_ids"`
	Label      string               `json:"label,omitempty"`
}

type ChannelRouteRule struct {
	GroupRegex []string    `json:"group_regex,omitempty"`
	Name       string      `json:"name"`
	ModelRegex []string    `json:"model_regex"`
	PathRegex  []string    `json:"path_regex"`
	ChannelIDs []int       `json:"channel_ids,omitempty"` // Deprecated: legacy fallback pool, kept for backward compatibility. Use RouteTiers with an empty-conditions tier instead.
	Strict     bool        `json:"strict"`
	RouteTiers []RouteTier `json:"route_tiers,omitempty"` // tiered routing; a tier with empty Conditions acts as the catch-all (fallback)
}

type ChannelRouteSetting struct {
	Enabled bool               `json:"enabled"`
	Rules   []ChannelRouteRule `json:"rules"`
}

var channelRouteSetting = ChannelRouteSetting{
	Enabled: false,
	Rules:   []ChannelRouteRule{},
}

func init() {
	config.GlobalConfig.Register("channel_route_setting", &channelRouteSetting)
}

func GetChannelRouteSetting() *ChannelRouteSetting {
	return &channelRouteSetting
}
