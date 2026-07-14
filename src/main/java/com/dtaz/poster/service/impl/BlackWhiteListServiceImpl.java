package com.dtaz.poster.service.impl;

import com.dtaz.poster.dto.CreateBlackWhiteListRequest;
import com.dtaz.poster.entity.BlackWhiteList;
import com.dtaz.poster.service.BlackWhiteListService;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 黑白名单服务实现
 */
@Service
public class BlackWhiteListServiceImpl implements BlackWhiteListService {
    
    @Override
    public Long createList(CreateBlackWhiteListRequest request) {
        validateRequest(request);
        
        // 转换实体
        List<BlackWhiteList> lists = request.getItems().stream()
            .map(item -> {
                BlackWhiteList list = new BlackWhiteList();
                list.setPlanId(request.getPlanId());
                list.setListType(request.getListType());
                list.setDimensionType(item.getDimensionType());
                list.setDimensionValue(String.join(",", item.getDimensionValues()));
                list.setStatus(1);
                return list;
            })
            .collect(Collectors.toList());
        
        // TODO: 调用DAO保存
        return 1L;
    }
    
    @Override
    public void updateList(Long listId, CreateBlackWhiteListRequest request) {
        validateRequest(request);
        // TODO: 更新逻辑
    }
    
    @Override
    public BlackWhiteListDetail queryListDetail(Long planId, String listType) {
        // TODO: 查询逻辑
        return new BlackWhiteListDetail();
    }
    
    @Override
    public void deleteList(Long listId) {
        // TODO: 删除逻辑（设置status=0）
    }
    
    private void validateRequest(CreateBlackWhiteListRequest request) {
        if (request.getPlanId() == null) {
            throw new IllegalArgumentException("投放计划ID不能为空");
        }
        if (request.getListType() == null) {
            throw new IllegalArgumentException("名单类型不能为空");
        }
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new IllegalArgumentException("名单项不能为空");
        }
    }
}