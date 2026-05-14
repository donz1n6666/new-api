package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSubscriptionOrderResumePayloadRoundTrip(t *testing.T) {
	order := &SubscriptionOrder{}
	err := order.SetResumePayload(&SubscriptionOrderResumePayload{
		Type: "form",
		URL:  "https://example.com/pay",
		Params: map[string]string{
			"trade_no": "sub-order-1",
			"sign":     "abc",
		},
	})
	require.NoError(t, err)

	payload := order.GetResumePayload()
	require.NotNil(t, payload)
	assert.Equal(t, "form", payload.Type)
	assert.Equal(t, "https://example.com/pay", payload.URL)
	assert.Equal(t, "abc", payload.Params["sign"])
}

func TestSubscriptionOrderEffectiveStatusUsesPendingHoldWindow(t *testing.T) {
	order := &SubscriptionOrder{
		Status:     common.TopUpStatusPending,
		CreateTime: time.Now().Add(-6 * time.Minute).Unix(),
	}
	now := time.Now().Unix()

	assert.Equal(t, common.TopUpStatusExpired, order.EffectiveStatus(now))
	assert.EqualValues(t, 0, order.RemainingSeconds(now))
	assert.EqualValues(t, order.CreateTime+300, order.ExpiresAt())
}

func TestCancelPendingSubscriptionOrder(t *testing.T) {
	truncateTables(t)

	plan := insertPlanForGroupBillingTest(t, 1201, "Cancelable Plan", false, 0)
	insertUserForSubscriptionTest(t, 3201, "default")
	require.NoError(t, DB.Create(&SubscriptionOrder{
		UserId:          3201,
		PlanId:          plan.Id,
		Money:           9.99,
		TradeNo:         "cancel-sub-order",
		PaymentMethod:   PaymentMethodStripe,
		PaymentProvider: PaymentProviderStripe,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}).Error)

	require.NoError(t, CancelPendingSubscriptionOrder(3201, "cancel-sub-order"))

	order := GetSubscriptionOrderByTradeNo("cancel-sub-order")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusExpired, order.Status)
	assert.NotZero(t, order.CompleteTime)
}
