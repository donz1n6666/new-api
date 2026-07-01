package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetMissingModels returns the list of model names that are referenced by channels
// but do not have corresponding records in the models meta table.
// This helps administrators quickly discover models that need configuration.
//
// Optional query parameter `group` narrows the result to abilities enabled under
// that group. When omitted (or set to "global") the global view is returned.
func GetMissingModels(c *gin.Context) {
	group := c.Query("group")
	missing, err := model.GetMissingModels(group)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    missing,
	})
}
