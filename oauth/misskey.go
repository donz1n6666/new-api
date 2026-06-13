package oauth

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func init() {
	Register("misskey", &MisskeyProvider{})
}

// MisskeyProvider implements OAuth for Misskey/Sharkey using the MiAuth protocol.
type MisskeyProvider struct{}

// MisskeyMiAuthSessionKey is the session key holding the MiAuth session ID.
const MisskeyMiAuthSessionKey = "misskey_miauth_session"

type misskeyUser struct {
	Id       string `json:"id"`
	Username string `json:"username"`
	Name     string `json:"name"`
}

func (p *MisskeyProvider) GetName() string {
	return "Misskey"
}

func (p *MisskeyProvider) IsEnabled() bool {
	return common.MisskeyOAuthEnabled && GetMisskeyInstanceUrl() != ""
}

// GetMisskeyInstanceUrl returns the configured instance URL without a trailing slash.
func GetMisskeyInstanceUrl() string {
	return strings.TrimRight(strings.TrimSpace(common.MisskeyInstanceUrl), "/")
}

// GetMisskeyDisplayName returns the configured display name, defaulting to "Misskey".
func GetMisskeyDisplayName() string {
	if name := strings.TrimSpace(common.MisskeyInstanceName); name != "" {
		return name
	}
	return "Misskey"
}

// GetMisskeyInstanceIcon returns the configured icon URL, if any.
func GetMisskeyInstanceIcon() string {
	return strings.TrimSpace(common.MisskeyInstanceIcon)
}

// misskeyServerBase returns the configured ServerAddress without trailing slash.
func misskeyServerBase() string {
	return strings.TrimRight(strings.TrimSpace(system_setting.ServerAddress), "/")
}

// GetMisskeyClientId returns the URL-shaped client_id for the IndieAuth
// metadata page (served for discoverability even in MiAuth mode).
func GetMisskeyClientId() string {
	return misskeyServerBase() + "/api/oauth/misskey/app"
}

// GetMisskeyRedirectUri returns the redirect_uri for the metadata page.
func GetMisskeyRedirectUri() string {
	return misskeyServerBase() + "/oauth/misskey"
}

// GenerateMiAuthSessionId generates a new UUID for MiAuth session.
func GenerateMiAuthSessionId() string {
	return uuid.New().String()
}

// BuildMiAuthUrl returns the MiAuth authorization URL.
func BuildMiAuthUrl(sessionId string, callbackUrl string) string {
	appName := "NewAPI"
	if common.SystemName != "" {
		appName = common.SystemName
	}
	return fmt.Sprintf("%s/miauth/%s?name=%s&callback=%s&permission=read:account",
		GetMisskeyInstanceUrl(),
		sessionId,
		url.QueryEscape(appName),
		url.QueryEscape(callbackUrl),
	)
}

// ExchangeMiAuthToken validates the MiAuth session and returns the access token.
func ExchangeMiAuthToken(ctx context.Context, sessionId string) (*OAuthToken, error) {
	instanceUrl := GetMisskeyInstanceUrl()
	if instanceUrl == "" {
		return nil, NewOAuthError(i18n.MsgOAuthNotEnabled, map[string]any{"Provider": "Misskey"})
	}

	checkUrl := fmt.Sprintf("%s/api/miauth/%s/check", instanceUrl, sessionId)
	reqBody, _ := common.Marshal(map[string]string{})

	req, err := http.NewRequestWithContext(ctx, "POST", checkUrl, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: 20 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Misskey] ExchangeMiAuthToken error: %s", err.Error()))
		return nil, NewOAuthErrorWithRaw(i18n.MsgOAuthConnectFailed, map[string]any{"Provider": "Misskey"}, err.Error())
	}
	defer res.Body.Close()

	var checkResp struct {
		Ok    bool   `json:"ok"`
		Token string `json:"token"`
	}
	if err = common.DecodeJson(res.Body, &checkResp); err != nil {
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Misskey] ExchangeMiAuthToken decode error: %s", err.Error()))
		return nil, err
	}

	if !checkResp.Ok || checkResp.Token == "" {
		logger.LogError(ctx, "[OAuth-Misskey] ExchangeMiAuthToken failed: session not valid")
		return nil, NewOAuthError(i18n.MsgOAuthTokenFailed, map[string]any{"Provider": "Misskey"})
	}

	return &OAuthToken{
		AccessToken: checkResp.Token,
		TokenType:   "Bearer",
	}, nil
}

// ExchangeToken is required by the Provider interface but MiAuth uses
// ExchangeMiAuthToken directly via the controller. This stub should not
// be called in normal flow.
func (p *MisskeyProvider) ExchangeToken(ctx context.Context, code string, c *gin.Context) (*OAuthToken, error) {
	return nil, NewOAuthError(i18n.MsgOAuthTokenFailed, map[string]any{"Provider": "Misskey"})
}

// GetUserInfo fetches user info from the Misskey /api/i endpoint.
func (p *MisskeyProvider) GetUserInfo(ctx context.Context, token *OAuthToken) (*OAuthUser, error) {
	logger.LogDebug(ctx, "[OAuth-Misskey] GetUserInfo: fetching user info")

	instanceUrl := GetMisskeyInstanceUrl()
	if instanceUrl == "" {
		return nil, NewOAuthError(i18n.MsgOAuthNotEnabled, map[string]any{"Provider": "Misskey"})
	}

	reqBody, err := common.Marshal(map[string]string{"i": token.AccessToken})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", instanceUrl+"/api/i", strings.NewReader(string(reqBody)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: 20 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Misskey] GetUserInfo error: %s", err.Error()))
		return nil, NewOAuthErrorWithRaw(i18n.MsgOAuthConnectFailed, map[string]any{"Provider": "Misskey"}, err.Error())
	}
	defer res.Body.Close()

	logger.LogDebug(ctx, "[OAuth-Misskey] GetUserInfo response status: %d", res.StatusCode)

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 500))
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Misskey] GetUserInfo failed: status=%d, body=%s", res.StatusCode, string(body)))
		return nil, NewOAuthErrorWithRaw(i18n.MsgOAuthGetUserErr, map[string]any{"Provider": "Misskey"}, fmt.Sprintf("status %d", res.StatusCode))
	}

	var misskeyUserData misskeyUser
	if err = common.DecodeJson(res.Body, &misskeyUserData); err != nil {
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Misskey] GetUserInfo decode error: %s", err.Error()))
		return nil, err
	}

	if misskeyUserData.Id == "" {
		logger.LogError(ctx, "[OAuth-Misskey] GetUserInfo failed: empty id")
		return nil, NewOAuthError(i18n.MsgOAuthUserInfoEmpty, map[string]any{"Provider": "Misskey"})
	}

	displayName := misskeyUserData.Name
	if displayName == "" {
		displayName = misskeyUserData.Username
	}

	logger.LogDebug(ctx, "[OAuth-Misskey] GetUserInfo success: id=%s, username=%s",
		misskeyUserData.Id, misskeyUserData.Username)

	return &OAuthUser{
		ProviderUserID: misskeyUserData.Id,
		Username:       misskeyUserData.Username,
		DisplayName:    displayName,
	}, nil
}

func (p *MisskeyProvider) IsUserIDTaken(providerUserID string) bool {
	return model.IsMisskeyIdAlreadyTaken(providerUserID)
}

func (p *MisskeyProvider) FillUserByProviderID(user *model.User, providerUserID string) error {
	user.MisskeyId = providerUserID
	return user.FillUserByMisskeyId()
}

func (p *MisskeyProvider) SetProviderUserID(user *model.User, providerUserID string) {
	user.MisskeyId = providerUserID
}

func (p *MisskeyProvider) GetProviderPrefix() string {
	return "misskey_"
}
