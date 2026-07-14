package com.dtaz.poster.service;

import com.dtaz.poster.dto.*;
import java.util.List;

/**
 * 海报圈选服务接口
 */
public interface PosterSelectionService {
    
    /**
     * 添加圈选配置
     */
    Long addSelection(AddSelectionRequest request);
    
    /**
     * 更新圈选配置
     */
    void updateSelection(Long selectionId, AddSelectionRequest request);
    
    /**
     * 查询圈选详情
     */
    SelectionDetailResponse querySelectionInfo(Long planId);
    
    /**
     * 批量解析ID
     */
    ParseIdsResponse batchParseIds(String idsInput);
    
    /**
     * 批量查询图灵人群信息
     */
    List<SelectionDetailResponse.CrowdDetail> queryCrowdDetails(List<String> bizTids);
}