package com.dtaz.poster.service.impl;

import com.dtaz.poster.dto.*;
import com.dtaz.poster.entity.PosterSelection;
import com.dtaz.poster.service.PosterSelectionService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 海报圈选服务实现
 */
@Service
public class PosterSelectionServiceImpl implements PosterSelectionService {
    
    private static final int MAX_ID_COUNT = 20;
    
    @Override
    public Long addSelection(AddSelectionRequest request) {
        // 验证参数
        validateRequest(request);
        
        // 转换并保存
        List<PosterSelection> selections = convertToEntities(request);
        
        // TODO: 调用DAO保存数据
        return 1L;
    }
    
    @Override
    public void updateSelection(Long selectionId, AddSelectionRequest request) {
        validateRequest(request);
        // TODO: 更新逻辑
    }
    
    @Override
    public SelectionDetailResponse querySelectionInfo(Long planId) {
        // TODO: 查询逻辑
        SelectionDetailResponse response = new SelectionDetailResponse();
        response.setPlanId(planId);
        return response;
    }
    
    @Override
    public ParseIdsResponse batchParseIds(String idsInput) {
        ParseIdsResponse response = new ParseIdsResponse();
        
        if (!StringUtils.hasText(idsInput)) {
            response.setIds(Collections.emptyList());
            response.setCount(0);
            return response;
        }
        
        // 按逗号分隔并去重
        List<String> ids = Arrays.stream(idsInput.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .distinct()
            .collect(Collectors.toList());
        
        if (ids.size() > MAX_ID_COUNT) {
            throw new IllegalArgumentException("最多支持" + MAX_ID_COUNT + "个ID");
        }
        
        response.setIds(ids);
        response.setCount(ids.size());
        return response;
    }
    
    @Override
    public List<SelectionDetailResponse.CrowdDetail> queryCrowdDetails(List<String> bizTids) {
        // TODO: 调用图灵平台API查询
        return Collections.emptyList();
    }
    
    private void validateRequest(AddSelectionRequest request) {
        if (request.getPlanId() == null) {
            throw new IllegalArgumentException("投放计划ID不能为空");
        }
        if (!StringUtils.hasText(request.getSelectionType())) {
            throw new IllegalArgumentException("圈选类型不能为空");
        }
        if (request.getSelectionItems() == null || request.getSelectionItems().isEmpty()) {
            throw new IllegalArgumentException("圈选项不能为空");
        }
    }
    
    private List<PosterSelection> convertToEntities(AddSelectionRequest request) {
        return request.getSelectionItems().stream()
            .map(item -> {
                PosterSelection selection = new PosterSelection();
                selection.setPlanId(request.getPlanId());
                selection.setSelectionType(request.getSelectionType());
                selection.setDimensionType(item.getDimensionType());
                selection.setDimensionValue(String.join(",", item.getDimensionValues()));
                return selection;
            })
            .collect(Collectors.toList());
    }
}