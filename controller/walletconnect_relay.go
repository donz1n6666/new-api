package controller

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const walletConnectOfficialRelayURL = "wss://relay.walletconnect.com/"

// WalletConnectRelayProxy proxies WalletConnect v2 Relay WebSocket traffic.
// It is intentionally pinned to the official relay to avoid open-proxy abuse
// and to prevent accidental proxy-to-proxy chains.
func WalletConnectRelayProxy(c *gin.Context) {
	if !setting.EthereumWalletConnectRelayProxyEnabled {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "WalletConnect relay proxy is disabled",
		})
		return
	}

	if !strings.EqualFold(c.GetHeader("Upgrade"), "websocket") {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"service": "WalletConnect Relay proxy",
			"target":  walletConnectOfficialRelayURL,
			"usage":   "Use this endpoint as a WebSocket relayUrl from the dApp frontend.",
		})
		return
	}

	upstreamURL, err := buildWalletConnectUpstreamURL(c.Request.URL.RawQuery)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid WalletConnect relay query",
		})
		return
	}

	requestedSubprotocols := websocket.Subprotocols(c.Request)
	dialer := websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: 15 * time.Second,
		Subprotocols:     requestedSubprotocols,
	}
	upstream, resp, err := dialer.Dial(upstreamURL, nil)
	if err != nil {
		status := http.StatusBadGateway
		if resp != nil && resp.StatusCode > 0 {
			status = resp.StatusCode
		}
		common.SysLog(fmt.Sprintf("WalletConnect Relay 代理连接上游失败: status=%d query=%s err=%v", status, safeWalletConnectRelayQuery(c.Request.URL.Query()), err))
		c.JSON(status, gin.H{
			"success": false,
			"message": "WalletConnect relay upstream connection failed",
		})
		return
	}
	defer upstream.Close()

	acceptedSubprotocols := requestedSubprotocols
	if upstream.Subprotocol() != "" {
		acceptedSubprotocols = []string{upstream.Subprotocol()}
	}
	upgrader := websocket.Upgrader{
		Subprotocols: acceptedSubprotocols,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	client, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		common.SysLog(fmt.Sprintf("WalletConnect Relay 代理升级客户端连接失败: %v", err))
		return
	}
	defer client.Close()

	common.SysLog(fmt.Sprintf("WalletConnect Relay 代理连接已建立: query=%s", safeWalletConnectRelayQuery(c.Request.URL.Query())))
	bridgeWalletConnectRelay(client, upstream)
}

func buildWalletConnectUpstreamURL(rawQuery string) (string, error) {
	target, err := url.Parse(walletConnectOfficialRelayURL)
	if err != nil {
		return "", err
	}
	target.RawQuery = rawQuery
	return target.String(), nil
}

func safeWalletConnectRelayQuery(values url.Values) string {
	copyValues := url.Values{}
	for key, items := range values {
		if key == "auth" || key == "symKey" || key == "relay-protocol" {
			copyValues[key] = []string{"[redacted]"}
			continue
		}
		copyValues[key] = append([]string(nil), items...)
	}
	return copyValues.Encode()
}

func bridgeWalletConnectRelay(client, upstream *websocket.Conn) {
	var once sync.Once
	closeBoth := func() {
		once.Do(func() {
			_ = client.Close()
			_ = upstream.Close()
		})
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go proxyWalletConnectMessages(client, upstream, closeBoth, &wg)
	go proxyWalletConnectMessages(upstream, client, closeBoth, &wg)
	wg.Wait()
}

func proxyWalletConnectMessages(src, dst *websocket.Conn, closeBoth func(), wg *sync.WaitGroup) {
	defer wg.Done()
	defer closeBoth()
	for {
		messageType, payload, err := src.ReadMessage()
		if err != nil {
			return
		}
		if err := dst.WriteMessage(messageType, payload); err != nil {
			return
		}
	}
}
