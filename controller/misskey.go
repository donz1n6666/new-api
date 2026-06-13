package controller

import (
	"fmt"
	"html"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

// MisskeyAuthorize starts the Misskey MiAuth login flow.
func MisskeyAuthorize(c *gin.Context) {
	provider := oauth.GetProvider("misskey")
	if provider == nil || !provider.IsEnabled() {
		common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams("Misskey"))
		return
	}

	session := sessions.Default(c)

	// Store affiliate code if provided
	affCode := c.Query("aff")
	if affCode != "" {
		session.Set("aff", affCode)
	}

	// CSRF state, verified on callback
	state := common.GetRandomString(12)
	session.Set("oauth_state", state)

	// MiAuth flow — no registered app needed.
	// State and sessionId are embedded in the callback URL because
	// SameSite=Strict cookies are dropped on cross-origin redirects.
	sessionId := oauth.GenerateMiAuthSessionId()

	if err := session.Save(); err != nil {
		common.ApiError(c, err)
		return
	}

	// MiAuth callback points to the FRONTEND route /oauth/misskey,
	// which then calls /api/oauth/misskey to complete the login.
	callbackUrl := fmt.Sprintf("%s/oauth/misskey?state=%s&sid=%s",
		misskeyServerBase(c), state, sessionId)
	miAuthUrl := oauth.BuildMiAuthUrl(sessionId, callbackUrl)
	logger.LogDebug(c, "[OAuth-Misskey] Redirecting to MiAuth: %s", miAuthUrl)
	c.Redirect(http.StatusFound, miAuthUrl)
}

// MisskeyMiAuthCallback handles the MiAuth callback. Misskey appends
// ?session={uuid} to our callback URL after the user authorizes.
// The CSRF state and original sessionId are passed via URL query params
// because SameSite=Strict cookies are lost on cross-origin redirects.
func MisskeyMiAuthCallback(c *gin.Context) {
	sess := sessions.Default(c)

	// Validate CSRF state from URL param against session cookie
	state := c.Query("state")
	if state == "" || sess.Get("oauth_state") == nil || state != sess.Get("oauth_state").(string) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
		})
		return
	}

	// Misskey appends ?session={uuid} to the callback URL.
	// We also passed the same sessionId as ?sid= in the authorize step.
	// Prefer the MiAuth-returned ?session param; cross-check against ?sid.
	sessionId := c.Query("session")
	sid := c.Query("sid")
	if sessionId == "" {
		sessionId = sid
	}
	if sessionId == "" || (sid != "" && sessionId != sid) {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
		})
		return
	}

	// Check if user is already logged in (bind flow)
	username := sess.Get("username")
	if username != nil {
		misskeyMiAuthBind(c, sessionId)
		return
	}

	// Exchange MiAuth session for token
	token, err := oauth.ExchangeMiAuthToken(c.Request.Context(), sessionId)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	// Get user info
	provider := oauth.GetProvider("misskey")
	oauthUser, err := provider.GetUserInfo(c.Request.Context(), token)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	// Find or create user
	user, err := findOrCreateOAuthUser(c, provider, oauthUser, sess)
	if err != nil {
		switch err.(type) {
		case *OAuthUserDeletedError:
			common.ApiErrorI18n(c, i18n.MsgOAuthUserDeleted)
		case *OAuthRegistrationDisabledError:
			common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		default:
			common.ApiError(c, err)
		}
		return
	}

	// Check user status
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorI18n(c, i18n.MsgOAuthUserBanned)
		return
	}

	setupLogin(user, c)
}

// MisskeyMiAuthLogin is the JSON API endpoint called by the frontend after
// receiving the MiAuth callback. It reads ?session= (MiAuth token) and
// ?state= (CSRF), exchanges for token, creates/finds user, sets up session.
// This is the frontend-facing counterpart to MisskeyMiAuthCallback.
func MisskeyMiAuthLogin(c *gin.Context) {
	// Check provider is enabled before doing anything
	provider := oauth.GetProvider("misskey")
	if provider == nil || !provider.IsEnabled() {
		common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams("Misskey"))
		return
	}

	sess := sessions.Default(c)

	// Validate CSRF state from URL param against session cookie
	state := c.Query("state")
	if state == "" || sess.Get("oauth_state") == nil || state != sess.Get("oauth_state").(string) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
		})
		return
	}

	// Get sessionId from Misskey's ?session= param, or ?code= alias.
	// The original session ID is also carried as ?sid= for cross-checking.
	sessionId := c.Query("session")
	if sessionId == "" {
		sessionId = c.Query("code")
	}
	sid := c.Query("sid")
	if sessionId == "" {
		sessionId = sid
	}
	if sessionId == "" || (sid != "" && sessionId != sid) {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
		})
		return
	}

	// Check if user is already logged in (bind flow)
	username := sess.Get("username")
	if username != nil {
		misskeyMiAuthBind(c, sessionId)
		return
	}

	// Exchange MiAuth session for token
	token, err := oauth.ExchangeMiAuthToken(c.Request.Context(), sessionId)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	// Get user info
	oauthUser, err := provider.GetUserInfo(c.Request.Context(), token)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	// Find or create user
	user, err := findOrCreateOAuthUser(c, provider, oauthUser, sess)
	if err != nil {
		switch err.(type) {
		case *OAuthUserDeletedError:
			common.ApiErrorI18n(c, i18n.MsgOAuthUserDeleted)
		case *OAuthRegistrationDisabledError:
			common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		default:
			common.ApiError(c, err)
		}
		return
	}

	// Check user status
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorI18n(c, i18n.MsgOAuthUserBanned)
		return
	}

	setupLogin(user, c)
}

// misskeyMiAuthBind binds a Misskey account to an existing logged-in user
// via the MiAuth flow.
func misskeyMiAuthBind(c *gin.Context, sessionId string) {
	session := sessions.Default(c)

	provider := oauth.GetProvider("misskey")
	if provider == nil || !provider.IsEnabled() {
		common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams("Misskey"))
		return
	}

	token, err := oauth.ExchangeMiAuthToken(c.Request.Context(), sessionId)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	oauthUser, err := provider.GetUserInfo(c.Request.Context(), token)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	if provider.IsUserIDTaken(oauthUser.ProviderUserID) {
		common.ApiErrorI18n(c, i18n.MsgOAuthAlreadyBound, providerParams("Misskey"))
		return
	}

	id := session.Get("id")
	user := model.User{Id: id.(int)}
	err = user.FillUserById()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	provider.SetProviderUserID(&user, oauthUser.ProviderUserID)
	err = user.Update(false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccessI18n(c, i18n.MsgOAuthBindSuccess, gin.H{
		"action": "bind",
	})
}

// MisskeyClientMetadata serves the IndieAuth client information page that the
// Misskey instance fetches when validating our URL-shaped client_id. It
// publishes the allowed redirect_uri (as both an HTTP Link header and a
// <link> tag) plus an h-app microformat carrying the app name and logo.
func MisskeyClientMetadata(c *gin.Context) {
	clientId := oauth.GetMisskeyClientId()
	redirectUri := oauth.GetMisskeyRedirectUri()

	name := common.SystemName
	if name == "" {
		name = "New API"
	}

	logoTag := ""
	if common.Logo != "" {
		logoTag = fmt.Sprintf(`<img class="u-logo" src="%s" alt="logo">`, html.EscapeString(common.Logo))
	}

	page := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>%s</title>
<link rel="redirect_uri" href="%s">
</head>
<body>
<div class="h-app">
<a href="%s" class="u-url p-name">%s</a>
%s
</div>
</body>
</html>
`,
		html.EscapeString(name),
		html.EscapeString(redirectUri),
		html.EscapeString(clientId),
		html.EscapeString(name),
		logoTag,
	)

	c.Header("Link", fmt.Sprintf(`<%s>; rel="redirect_uri"`, redirectUri))
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(page))
}

// misskeyServerBase returns the public base URL of this New API instance.
func misskeyServerBase(c *gin.Context) string {
	scheme := "https"
	if c.Request.TLS == nil {
		if forwardedProto := c.GetHeader("X-Forwarded-Proto"); forwardedProto != "" {
			scheme = forwardedProto
		} else {
			scheme = "http"
		}
	}
	host := c.Request.Host
	if forwardedHost := c.GetHeader("X-Forwarded-Host"); forwardedHost != "" {
		host = forwardedHost
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}
