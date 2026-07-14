package com.dtaz.poster.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 黑白名单实体
 */
@Data
public class BlackWhiteList {
    /**
     * 主键
     */
    private Long id;
    
    /**
     * 投放计划ID
     */
    private Long planId;
    
    /**
     * 名单类型：BLACK/WHITE
     */
    private String listType;
    
    /**
     * 维度类型：BIZ_TID/STORE_ID
     */
    private String dimensionType;
    
    /**
     * 维度值（多个以逗号分隔）
     */
    private String dimensionValue;
    
    /**
     * 状态：0-无效，1-有效
     */
    private Integer status;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
    
    /**
     * 创建人
     */
    private String creator;
}