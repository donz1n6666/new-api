package controller

import (
	"strings"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func TestParsePaymentReceivedData(t *testing.T) {
	tokenWord := strings.Repeat("0", 24) + "1111111111111111111111111111111111111111"
	amountWord := strings.Repeat("0", 63) + "a"

	token, amount, err := parsePaymentReceivedData("0x" + tokenWord + amountWord)
	require.NoError(t, err)
	require.Equal(t, "0x1111111111111111111111111111111111111111", token)
	require.Equal(t, "10", amount)
}

func TestCalcPayAmountDecimalKeepsFractionalSubscriptionPrice(t *testing.T) {
	amount, err := calcPayAmountDecimal(decimal.NewFromFloat(9.99), "1", 6)
	require.NoError(t, err)
	require.Equal(t, "9990000", amount)
}
