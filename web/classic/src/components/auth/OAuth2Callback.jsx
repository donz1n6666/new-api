/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useContext, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  API,
  showError,
  showSuccess,
  updateAPI,
  setUserData,
} from '../../helpers';
import { UserContext } from '../../context/User';
import Loading from '../common/ui/Loading';

const OAuth2Callback = (props) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [, userDispatch] = useContext(UserContext);
  const navigate = useNavigate();
  
  // 防止 React 18 Strict Mode 下重复执行
  const hasExecuted = useRef(false);

  // 最大重试次数
  const MAX_RETRIES = 3;

  const sendOAuthCallback = async (params, retry = 0) => {
    try {
      const { code, state, session, sid } = params;
      const isMisskeyMiAuth = props.type === 'misskey';
      const apiPath = isMisskeyMiAuth
        ? '/api/oauth/misskey/login'
        : `/api/oauth/${props.type}`;
      const requestParams = {
        state: state || '',
      };

      if (isMisskeyMiAuth) {
        requestParams.session = session || code;
        if (sid) {
          requestParams.sid = sid;
        }
      } else {
        requestParams.code = code;
      }

      const { data: resData } = await API.get(apiPath, {
        params: requestParams,
      });

      const { success, message, data } = resData;

      if (!success) {
        // 业务错误不重试，直接显示错误
        showError(message || t('授权失败'));
        return;
      }

      if (data?.action === 'bind') {
        showSuccess(t('绑定成功！'));
        navigate('/console/personal');
      } else {
        // setupLogin returns minimal data; fetch full user to get binding IDs
        try {
          const selfRes = await API.get('/api/user/self');
          if (selfRes.data?.success && selfRes.data.data) {
            const fullUser = selfRes.data.data;
            userDispatch({ type: 'login', payload: fullUser });
            localStorage.setItem('user', JSON.stringify(fullUser));
            setUserData(fullUser);
          } else {
            userDispatch({ type: 'login', payload: data });
            localStorage.setItem('user', JSON.stringify(data));
            setUserData(data);
          }
        } catch {
          userDispatch({ type: 'login', payload: data });
          localStorage.setItem('user', JSON.stringify(data));
          setUserData(data);
        }
        updateAPI();
        showSuccess(t('登录成功！'));
        navigate('/console/token');
      }
    } catch (error) {
      // 网络错误等可重试
      if (retry < MAX_RETRIES) {
        // 递增的退避等待
        await new Promise((resolve) => setTimeout(resolve, (retry + 1) * 2000));
        return sendOAuthCallback(params, retry + 1);
      }

      // 重试次数耗尽，提示错误并返回设置页面
      showError(error.message || t('授权失败'));
      navigate('/console/personal');
    }
  };

  useEffect(() => {
    // 防止 React 18 Strict Mode 下重复执行
    if (hasExecuted.current) {
      return;
    }
    hasExecuted.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const session = searchParams.get('session');
    const sid = searchParams.get('sid');
    const isMisskeyMiAuth = props.type === 'misskey';

    // 参数缺失直接返回
    if ((!isMisskeyMiAuth && !code) || (isMisskeyMiAuth && !code && !session)) {
      showError(t('未获取到授权码'));
      navigate('/console/personal');
      return;
    }

    sendOAuthCallback({ code, state, session, sid });
  }, []);

  return <Loading />;
};

export default OAuth2Callback;
