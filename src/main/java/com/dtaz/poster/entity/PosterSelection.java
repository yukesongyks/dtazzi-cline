package com.dtaz.poster.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 圈选配置实体
 */
@Data
public class PosterSelection {
    /**
     * 主键
     */
    private Long id;
    
    /**
     * 投放计划ID
     */
    private Long planId;
    
    /**
     * 圈选类型：GLOBAL/BLACK_LIST/WHITE_LIST
     */
    private String selectionType;
    
    /**
     * 维度类型：BIZ_TID/STORE_ID
     */
    private String dimensionType;
    
    /**
     * 维度值（多个以逗号分隔）
     */
    private String dimensionValue;
    
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
    
    /**
     * 更新人
     */
    private String updater;
}