package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

type ChannelRouteRule struct {
	GroupRegex []string `json:"group_regex,omitempty"`
	Name       string   `json:"name"`
	ModelRegex []string `json:"model_regex"`
	PathRegex  []string `json:"path_regex"`
	ChannelIDs []int    `json:"channel_ids"`
	Strict     bool     `json:"strict"`
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
