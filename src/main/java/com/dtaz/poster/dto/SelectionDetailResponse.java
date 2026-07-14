package com.dtaz.poster.dto;

import lombok.Data;
import java.util.List;

/**
 * 圈选详情响应
 */
@Data
public class SelectionDetailResponse {
    /**
     * 投放计划ID
     */
    private Long planId;
    
    /**
     * 圈选配置列表
     */
    private List<SelectionGroup> selections;
    
    @Data
    public static class SelectionGroup {
        /**
         * 圈选类型
         */
        private String selectionType;
        
        /**
         * 圈选项列表
         */
        private List<SelectionItem> items;
    }
    
    @Data
    public static class SelectionItem {
        /**
         * 维度类型
         */
        private String dimensionType;
        
        /**
         * 维度值列表
         */
        private List<String> dimensionValues;
        
        /**
         * 详情列表
         */
        private List<CrowdDetail> details;
    }
    
    @Data
    public static class CrowdDetail {
        /**
         * 图灵人群ID
         */
        private String bizTid;
        
        /**
         * 标签名称
         */
        private String labelName;
        
        /**
         * 设备数量
         */
        private Long deviceCount;
        
        /**
         * 有效期
         */
        private String validPeriod;
    }
}