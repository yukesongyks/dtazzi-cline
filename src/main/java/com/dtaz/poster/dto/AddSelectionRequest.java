package com.dtaz.poster.dto;

import lombok.Data;
import java.util.List;

/**
 * 添加圈选配置请求
 */
@Data
public class AddSelectionRequest {
    /**
     * 投放计划ID
     */
    private Long planId;
    
    /**
     * 圈选类型
     */
    private String selectionType;
    
    /**
     * 圈选项列表
     */
    private List<SelectionItem> selectionItems;
    
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
    }
}