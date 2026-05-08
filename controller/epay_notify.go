package controller

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/shopspring/decimal"
)

const unifiedEpayNotifyPath = "/api/epay/notify"

func getUnifiedEpayNotifyURL() string {
	return strings.TrimRight(service.GetCallbackAddress(), "/") + unifiedEpayNotifyPath
}

func getUnifiedEpayNotifyURLParsed() *url.URL {
	notifyURL, err := url.Parse(getUnifiedEpayNotifyURL())
	if err != nil {
		return nil
	}
	return notifyURL
}

func parseEpayParams(c *gin.Context) map[string]string {
	if c.Request.Method == "POST" {
		if err := c.Request.ParseForm(); err != nil {
			log.Println("易支付回调POST解析失败:", err)
			return nil
		}
		return lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, key string, _ int) map[string]string {
			r[key] = c.Request.PostForm.Get(key)
			return r
		}, map[string]string{})
	}

	return lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, key string, _ int) map[string]string {
		r[key] = c.Request.URL.Query().Get(key)
		return r
	}, map[string]string{})
}

func writeEpayNotifyResult(c *gin.Context, success bool) {
	result := "fail"
	if success {
		result = "success"
	}
	if _, err := c.Writer.Write([]byte(result)); err != nil {
		log.Println("易支付回调写入失败:", err)
	}
}

func completeTopUpEpayOrder(c *gin.Context, verifyInfo *epay.VerifyRes) error {
	LockOrder(verifyInfo.ServiceTradeNo)
	defer UnlockOrder(verifyInfo.ServiceTradeNo)

	topUp := model.GetTopUpByTradeNo(verifyInfo.ServiceTradeNo)
	if topUp == nil {
		return fmt.Errorf("topup order not found: %s", verifyInfo.ServiceTradeNo)
	}
	if topUp.PaymentProvider != model.PaymentProviderEpay {
		return fmt.Errorf("payment provider mismatch: %s", topUp.PaymentProvider)
	}
	if topUp.Status == common.TopUpStatusPending {
		if topUp.PaymentMethod != verifyInfo.Type {
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 实际支付方式与订单不同 trade_no=%s order_payment_method=%s actual_type=%s client_ip=%s", verifyInfo.ServiceTradeNo, topUp.PaymentMethod, verifyInfo.Type, c.ClientIP()))
			topUp.PaymentMethod = verifyInfo.Type
		}
		topUp.Status = common.TopUpStatusSuccess
		if err := topUp.Update(); err != nil {
			return err
		}

		dAmount := decimal.NewFromInt(int64(topUp.Amount))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		quotaToAdd := int(dAmount.Mul(dQuotaPerUnit).IntPart())
		if err := model.IncreaseUserQuota(topUp.UserId, quotaToAdd, true); err != nil {
			return err
		}

		logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 充值成功 trade_no=%s user_id=%d client_ip=%s quota_to_add=%d money=%.2f", topUp.TradeNo, topUp.UserId, c.ClientIP(), quotaToAdd, topUp.Money))
		model.RecordTopupLog(topUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money), c.ClientIP(), topUp.PaymentMethod, "epay")
	}
	return nil
}

func completeSubscriptionEpayOrder(c *gin.Context, verifyInfo *epay.VerifyRes) error {
	LockOrder(verifyInfo.ServiceTradeNo)
	defer UnlockOrder(verifyInfo.ServiceTradeNo)
	return model.CompleteSubscriptionOrder(verifyInfo.ServiceTradeNo, common.GetJsonString(verifyInfo), model.PaymentProviderEpay, verifyInfo.Type)
}

// EpayUnifiedNotify handles epay callbacks for both top-up and subscription orders.
// Routes based on trade number prefix: SUBUSR -> subscription, USR -> top-up.
func EpayUnifiedNotify(c *gin.Context) {
	if !isEpayWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 被拒绝 reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		writeEpayNotifyResult(c, false)
		return
	}

	params := parseEpayParams(c)
	if len(params) == 0 {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付统一回调参数为空 client_ip=%s", c.ClientIP()))
		writeEpayNotifyResult(c, false)
		return
	}

	client := GetEpayClient()
	if client == nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付统一回调失败 client 未初始化 client_ip=%s", c.ClientIP()))
		writeEpayNotifyResult(c, false)
		return
	}

	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付统一回调签名验证失败 client_ip=%s verify_error=%v", c.ClientIP(), err))
		writeEpayNotifyResult(c, false)
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付统一回调验签成功 trade_no=%s callback_type=%s trade_status=%s client_ip=%s", verifyInfo.ServiceTradeNo, verifyInfo.Type, verifyInfo.TradeStatus, c.ClientIP()))

	if verifyInfo.TradeStatus != epay.StatusTradeSuccess {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付统一回调忽略非成功订单 trade_no=%s status=%s client_ip=%s", verifyInfo.ServiceTradeNo, verifyInfo.TradeStatus, c.ClientIP()))
		writeEpayNotifyResult(c, true)
		return
	}

	switch {
	case strings.HasPrefix(verifyInfo.ServiceTradeNo, "SUBUSR"):
		err = completeSubscriptionEpayOrder(c, verifyInfo)
	case strings.HasPrefix(verifyInfo.ServiceTradeNo, "USR"):
		err = completeTopUpEpayOrder(c, verifyInfo)
	default:
		err = fmt.Errorf("unknown epay trade prefix: %s", verifyInfo.ServiceTradeNo)
	}

	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付统一回调处理失败: %v client_ip=%s", err, c.ClientIP()))
		writeEpayNotifyResult(c, false)
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付统一回调处理成功 trade_no=%s client_ip=%s", verifyInfo.ServiceTradeNo, c.ClientIP()))
	writeEpayNotifyResult(c, true)
}
