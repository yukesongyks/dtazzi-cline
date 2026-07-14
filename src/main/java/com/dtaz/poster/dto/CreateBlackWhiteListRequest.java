package com.dtaz.poster.dto;

import lombok.Data;
import java.util.List;

/**
 * 创建黑白名单请求
 */
@Data
public class CreateBlackWhiteListRequest {
    /**
     * 投放计划ID
     */
    private Long planId;
    
    /**
     * 名单类型：BLACK/WHITE
     */
    private String listType;
    
    /**
     * 名单项列表
     */
    private List<ListItem> items;
    
    @Data
    public static class ListItem {
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