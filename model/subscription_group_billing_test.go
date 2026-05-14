package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func insertPlanForGroupBillingTest(t *testing.T, id int, title string, disableBalance bool, maxPurchaseTotal int) *SubscriptionPlan {
	t.Helper()
	plan := &SubscriptionPlan{
		Id:                      id,
		Title:                   title,
		PriceAmount:             9.99,
		Currency:                "USD",
		DurationUnit:            SubscriptionDurationMonth,
		DurationValue:           1,
		Enabled:                 true,
		TotalAmount:             1000,
		DisableBalanceDeduction: disableBalance,
		MaxPurchaseTotal:        maxPurchaseTotal,
	}
	require.NoError(t, DB.Create(plan).Error)
	return plan
}

func insertUserSubscriptionForGroupBillingTest(t *testing.T, id int, userId int, planId int, upgradeGroup string, totalAmount int64) *UserSubscription {
	t.Helper()
	sub := &UserSubscription{
		Id:           id,
		UserId:       userId,
		PlanId:       planId,
		AmountTotal:  totalAmount,
		AmountUsed:   0,
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(30 * 24 * time.Hour).Unix(),
		UpgradeGroup: upgradeGroup,
	}
	require.NoError(t, DB.Create(sub).Error)
	return sub
}

func getUserSubscriptionForGroupBillingTest(t *testing.T, id int) *UserSubscription {
	t.Helper()
	var sub UserSubscription
	require.NoError(t, DB.Where("id = ?", id).First(&sub).Error)
	return &sub
}

func TestHasDisableBalanceDeductionSubscriptionForUsingGroup(t *testing.T) {
	truncateTables(t)

	vipPlan := insertPlanForGroupBillingTest(t, 1001, "VIP Plan", true, 0)
	insertUserSubscriptionForGroupBillingTest(t, 2001, 3001, vipPlan.Id, "vip", 1000)

	hasVipLock, err := HasDisableBalanceDeductionSubscriptionForUsingGroup(3001, "vip")
	require.NoError(t, err)
	assert.True(t, hasVipLock)

	hasDefaultLock, err := HasDisableBalanceDeductionSubscriptionForUsingGroup(3001, "default")
	require.NoError(t, err)
	assert.False(t, hasDefaultLock)
}

func TestPreConsumeUserSubscription_MatchesUsingGroup(t *testing.T) {
	truncateTables(t)

	vipPlan := insertPlanForGroupBillingTest(t, 1002, "VIP Plan", true, 0)
	vipSub := insertUserSubscriptionForGroupBillingTest(t, 2002, 3002, vipPlan.Id, "vip", 1000)

	_, err := PreConsumeUserSubscription("req-default", 3002, "gpt-test", 0, 100, "default")
	require.Error(t, err)

	result, err := PreConsumeUserSubscription("req-vip", 3002, "gpt-test", 0, 100, "vip")
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, vipSub.Id, result.UserSubscriptionId)
	assert.EqualValues(t, 100, result.PreConsumed)

	updatedVipSub := getUserSubscriptionForGroupBillingTest(t, vipSub.Id)
	assert.EqualValues(t, 100, updatedVipSub.AmountUsed)
}

func TestCheckSubscriptionPlanPurchaseAllowed_GlobalLimitIncludesPendingOrders(t *testing.T) {
	truncateTables(t)

	plan := insertPlanForGroupBillingTest(t, 1003, "Limited Plan", false, 2)
	insertUserSubscriptionForGroupBillingTest(t, 2003, 3003, plan.Id, "", 1000)
	require.NoError(t, DB.Create(&SubscriptionOrder{
		UserId:     3004,
		PlanId:     plan.Id,
		Money:      9.99,
		TradeNo:    "pending-plan-limit",
		Status:     common.TopUpStatusPending,
		CreateTime: time.Now().Unix(),
	}).Error)

	err := CheckSubscriptionPlanPurchaseAllowed(3005, plan, true)
	require.Error(t, err)
	assert.Equal(t, "该套餐已售罄", err.Error())
}

func TestCreateUserSubscriptionFromPlanTx_GlobalLimitBlocksFurtherCreation(t *testing.T) {
	truncateTables(t)

	plan := insertPlanForGroupBillingTest(t, 1004, "Single Seat Plan", false, 1)
	insertUserSubscriptionForGroupBillingTest(t, 2004, 3006, plan.Id, "", 1000)

	err := DB.Transaction(func(tx *gorm.DB) error {
		_, err := CreateUserSubscriptionFromPlanTx(tx, 3007, plan, "order")
		return err
	})
	require.Error(t, err)
	assert.Equal(t, "该套餐已售罄", err.Error())
}
