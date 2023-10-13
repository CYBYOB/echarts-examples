/*
title: Basic Line Chart 2
category: line
titleCN: 基础折线图
difficulty: 0
*/

option = {
  xAxis: {
    type: 'category',
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  yAxis: {
    type: 'value'
  },
  series: [
    {
      data: [150, 230, 224, 218, 135, 147, 2600],
      type: 'line'
    }
  ]
};

export {};
