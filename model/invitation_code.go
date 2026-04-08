package model

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"gorm.io/gorm"
)

type InvitationCode struct {
	Id          int            `json:"id"`
	UserId      int            `json:"user_id" gorm:"index"`                          // 生成者 ID
	Code        string         `json:"code" gorm:"type:varchar(32);uniqueIndex"`       // 邀请码
	Status      int            `json:"status" gorm:"default:1"`                        // 1=未使用, 2=已使用, 3=已禁用
	UsedUserId  int            `json:"used_user_id"`                                   // 使用者 ID
	UsedTime    int64          `json:"used_time" gorm:"bigint"`                        // 使用时间
	CreatedTime int64          `json:"created_time" gorm:"bigint"`                     // 创建时间
	Count       int            `json:"count" gorm:"-:all"`                             // 仅用于批量创建请求
	Remark      string         `json:"remark" gorm:"type:varchar(255)" validate:"max=255"` // 备注
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}

func GetAllInvitationCodes(startIdx int, num int) (codes []*InvitationCode, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = tx.Model(&InvitationCode{}).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return codes, total, nil
}

func SearchInvitationCodes(keyword string, startIdx int, num int) (codes []*InvitationCode, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&InvitationCode{})

	if id, err := strconv.Atoi(keyword); err == nil {
		query = query.Where("id = ? OR code LIKE ? OR remark LIKE ?", id, keyword+"%", keyword+"%")
	} else {
		query = query.Where("code LIKE ? OR remark LIKE ?", keyword+"%", keyword+"%")
	}

	err = query.Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return codes, total, nil
}

func GetMyInvitationCodes(userId int, startIdx int, num int) (codes []*InvitationCode, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = tx.Model(&InvitationCode{}).Where("user_id = ?", userId).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = tx.Where("user_id = ?", userId).Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return codes, total, nil
}

func GetInvitationCodeById(id int) (*InvitationCode, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}
	code := InvitationCode{Id: id}
	err := DB.First(&code, "id = ?", id).Error
	return &code, err
}

func GetInvitationCodeByCode(codeStr string) (*InvitationCode, error) {
	if codeStr == "" {
		return nil, errors.New("邀请码为空")
	}
	var code InvitationCode
	err := DB.Where("code = ?", codeStr).First(&code).Error
	if err != nil {
		return nil, err
	}
	return &code, nil
}

func UseInvitationCode(codeStr string, userId int) error {
	if codeStr == "" {
		return errors.New("邀请码为空")
	}
	if userId == 0 {
		return errors.New("无效的 user id")
	}

	common.RandomSleep()
	return DB.Transaction(func(tx *gorm.DB) error {
		var code InvitationCode
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where("code = ?", codeStr).First(&code).Error
		if err != nil {
			return errors.New("无效的邀请码")
		}
		if code.Status != common.InvitationCodeStatusEnabled {
			return errors.New("该邀请码已被使用或已禁用")
		}
		code.Status = common.InvitationCodeStatusUsed
		code.UsedUserId = userId
		code.UsedTime = common.GetTimestamp()
		return tx.Save(&code).Error
	})
}

func (code *InvitationCode) Insert() error {
	return DB.Create(code).Error
}

func (code *InvitationCode) Update() error {
	return DB.Model(code).Select("status", "remark").Updates(code).Error
}

func (code *InvitationCode) Delete() error {
	return DB.Delete(code).Error
}

func DeleteInvitationCodeById(id int) error {
	if id == 0 {
		return errors.New("id 为空！")
	}
	code := InvitationCode{Id: id}
	err := DB.Where(code).First(&code).Error
	if err != nil {
		return err
	}
	return code.Delete()
}

func DeleteUsedInvitationCodes() (int64, error) {
	result := DB.Where("status = ?", common.InvitationCodeStatusUsed).Delete(&InvitationCode{})
	return result.RowsAffected, result.Error
}

// GenerateInvitationCodeForUser 为用户生成邀请码，扣减额度
func GenerateInvitationCodeForUser(userId int, remark string) (*InvitationCode, error) {
	price := common.InvitationCodePrice
	if price > 0 {
		userQuota, err := GetUserQuota(userId, true)
		if err != nil {
			return nil, err
		}
		if userQuota < price {
			return nil, errors.New("额度不足")
		}
		err = DecreaseUserQuota(userId, price)
		if err != nil {
			return nil, err
		}
		RecordLog(userId, LogTypeSystem, fmt.Sprintf("生成邀请码消耗 %s", logger.LogQuota(price)))
	}

	code := &InvitationCode{
		UserId:      userId,
		Code:        common.GetUUID(),
		Status:      common.InvitationCodeStatusEnabled,
		CreatedTime: common.GetTimestamp(),
		Remark:      remark,
	}
	err := code.Insert()
	if err != nil {
		// 如果插入失败，退还额度
		if price > 0 {
			_ = IncreaseUserQuota(userId, price, true)
		}
		return nil, err
	}
	return code, nil
}
