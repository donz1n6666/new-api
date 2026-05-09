package setting

import (
	"github.com/QuantumNous/new-api/common"
)

// EthereumToken represents a single accepted token configuration.
// Address "0x0000000000000000000000000000000000000000" means native ETH.
type EthereumToken struct {
	Symbol   string `json:"symbol"`
	Address  string `json:"address"`  // checksummed hex address or zero address for ETH
	Decimals int    `json:"decimals"` // 18 for ETH, 6 for USDT/USDC, etc.
	// Price is the token amount per ONE top-up unit (i.e. per "1 USD equivalent").
	// E.g. for ETH at $3000: "0.000333"  |  for USDT: "1.0"
	Price string `json:"price"`
}

var (
	EthereumEnabled                  bool
	EthereumChainId                  int64  = 11155111 // Sepolia testnet default
	EthereumContractAddress          string            // deployed contract checksummed address
	EthereumAlchemyWebhookSigningKey string            // signing key from Alchemy dashboard
	EthereumMinTopUp                 int    = 1
)

// DefaultEthereumTokens is the factory default (ETH only on Sepolia).
var DefaultEthereumTokens = []EthereumToken{
	{
		Symbol:   "ETH",
		Address:  "0x0000000000000000000000000000000000000000",
		Decimals: 18,
		Price:    "0.001",
	},
}

// GetEthereumTokens reads the current token list from OptionMap (thread-safe).
func GetEthereumTokens() []EthereumToken {
	common.OptionMapRWMutex.RLock()
	jsonStr := common.OptionMap["EthereumSupportedTokens"]
	common.OptionMapRWMutex.RUnlock()

	if jsonStr == "" {
		return copyDefaultEthereumTokens()
	}
	var tokens []EthereumToken
	if err := common.UnmarshalJsonStr(jsonStr, &tokens); err != nil {
		return copyDefaultEthereumTokens()
	}
	return tokens
}

func copyDefaultEthereumTokens() []EthereumToken {
	cp := make([]EthereumToken, len(DefaultEthereumTokens))
	copy(cp, DefaultEthereumTokens)
	return cp
}

// EthereumTokens2JsonString serialises DefaultEthereumTokens for InitOptionMap.
func EthereumTokens2JsonString() string {
	b, err := common.Marshal(DefaultEthereumTokens)
	if err != nil {
		return "[]"
	}
	return string(b)
}
