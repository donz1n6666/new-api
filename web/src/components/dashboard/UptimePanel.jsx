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

import React from 'react';
import {
  Card,
  Button,
  Spin,
  Tabs,
  TabPane,
  Tag,
  Empty,
} from '@douyinfe/semi-ui';
import { Gauge, RefreshCw, Activity } from 'lucide-react';
import {
  IllustrationConstruction,
  IllustrationConstructionDark,
} from '@douyinfe/semi-illustrations';
import ScrollableContainer from '../common/ui/ScrollableContainer';

const UptimePanel = ({
  uptimeData,
  uptimeLoading,
  activeUptimeTab,
  setActiveUptimeTab,
  loadUptimeData,
  uptimeLegendData,
  renderMonitorList,
  modelAvailabilityData,
  renderModelAvailabilityList,
  modelAvailabilityTabKey,
  modelAvailabilityLegendData,
  CARD_PROPS,
  ILLUSTRATION_SIZE,
  t,
}) => {
  // 合并 Uptime Kuma 数据和模型可用性数据
  const hasUptimeData = uptimeData && uptimeData.length > 0;
  const hasModelData = modelAvailabilityData && modelAvailabilityData.length > 0;

  // 生成最终的 Tab 数据
  const finalTabs = [];
  if (hasUptimeData) {
    finalTabs.push(...uptimeData);
  }

  // 始终添加模型可用性 Tab（即使没有数据也可以展示）
  const modelTab = {
    categoryName: modelAvailabilityTabKey,
    isModelAvailability: true,
    monitors: modelAvailabilityData || [],
  };
  finalTabs.push(modelTab);

  // 初始化选中第一个 Tab
  React.useEffect(() => {
    if (!activeUptimeTab && finalTabs.length > 0) {
      setActiveUptimeTab(finalTabs[0].categoryName);
    }
  }, [activeUptimeTab, finalTabs, setActiveUptimeTab]);

  // 获取当前激活的 Tab 数据
  const activeTabData = finalTabs.find((tab) => tab.categoryName === activeUptimeTab);
  const isModelAvailabilityTab = activeTabData?.isModelAvailability;

  // 确定显示哪个图例
  const currentLegendData = isModelAvailabilityTab
    ? modelAvailabilityLegendData
    : uptimeLegendData;
  return (
    <Card
      {...CARD_PROPS}
      className='shadow-sm !rounded-2xl lg:col-span-1'
      title={
        <div className='flex items-center justify-between w-full gap-2'>
          <div className='flex items-center gap-2'>
            <Gauge size={16} />
            {t('服务可用性')}
          </div>
          <Button
            icon={<RefreshCw size={14} />}
            onClick={loadUptimeData}
            loading={uptimeLoading}
            size='small'
            theme='borderless'
            type='tertiary'
            className='text-gray-500 hover:text-blue-500 hover:bg-blue-50 !rounded-full'
          />
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      {/* 内容区域 */}
      <div className='relative'>
        <Spin spinning={uptimeLoading}>
          {finalTabs.length === 1 ? (
            <ScrollableContainer maxHeight='24rem'>
              {isModelAvailabilityTab
                ? renderModelAvailabilityList(activeTabData?.monitors || [])
                : renderMonitorList(activeTabData?.monitors || [])}
            </ScrollableContainer>
          ) : (
            <Tabs
              type='card'
              collapsible
              activeKey={activeUptimeTab}
              onTabClick={setActiveUptimeTab}
              size='small'
            >
              {finalTabs.map((tab, groupIdx) => (
                <TabPane
                  tab={
                    <span className='flex items-center gap-2'>
                      {tab.isModelAvailability ? (
                        <Activity size={14} />
                      ) : (
                        <Gauge size={14} />
                      )}
                      {tab.isModelAvailability ? t('模型状态') : tab.categoryName}
                    </span>
                  }
                  itemKey={tab.categoryName}
                  key={groupIdx}
                >
                  <ScrollableContainer maxHeight='21.5rem'>
                    {tab.isModelAvailability
                      ? renderModelAvailabilityList(tab.monitors)
                      : renderMonitorList(tab.monitors)}
                  </ScrollableContainer>
                </TabPane>
              ))}
            </Tabs>
          )}
        </Spin>
      </div>

      {/* 图例 */}
      {currentLegendData && currentLegendData.length > 0 && (
        <div className='p-3 bg-gray-50 rounded-b-2xl'>
          <div className='flex flex-wrap gap-3 text-xs justify-center'>
            {currentLegendData.map((legend, index) => (
              <div key={index} className='flex items-center gap-1'>
                <div
                  className='w-2 h-2 rounded-full'
                  style={{ backgroundColor: legend.color }}
                />
                <span className='text-gray-600'>{legend.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

export default UptimePanel;
