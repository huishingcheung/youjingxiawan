#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI智能游径规划系统 - 后端服务器
提供AI对话和路线规划API接口
"""

import json
import random
import time
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import math

# 坐标转换函数
def bd09_to_wgs84(bd_lng, bd_lat):
    """百度坐标系(BD-09)转WGS84坐标系"""
    # BD09 to GCJ02
    x = bd_lng - 0.0065
    y = bd_lat - 0.006
    z = math.sqrt(x * x + y * y) - 0.00002 * math.sin(y * math.pi)
    theta = math.atan2(y, x) - 0.000003 * math.cos(x * math.pi)
    gcj_lng = z * math.cos(theta)
    gcj_lat = z * math.sin(theta)
    
    # GCJ02 to WGS84
    dlat = transform_lat(gcj_lng - 105.0, gcj_lat - 35.0)
    dlng = transform_lng(gcj_lng - 105.0, gcj_lat - 35.0)
    radlat = gcj_lat / 180.0 * math.pi
    magic = math.sin(radlat)
    magic = 1 - 0.00669342162296594323 * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((6378245.0 * (1 - 0.00669342162296594323)) / (magic * sqrtmagic) * math.pi)
    dlng = (dlng * 180.0) / (6378245.0 / sqrtmagic * math.cos(radlat) * math.pi)
    mglat = gcj_lat - dlat
    mglng = gcj_lng - dlng
    return [mglng, mglat]

def transform_lat(lng, lat):
    ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * math.sqrt(abs(lng))
    ret += (20.0 * math.sin(6.0 * lng * math.pi) + 20.0 * math.sin(2.0 * lng * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(lat * math.pi) + 40.0 * math.sin(lat / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(lat / 12.0 * math.pi) + 320 * math.sin(lat * math.pi / 30.0)) * 2.0 / 3.0
    return ret

def transform_lng(lng, lat):
    ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * math.sqrt(abs(lng))
    ret += (20.0 * math.sin(6.0 * lng * math.pi) + 20.0 * math.sin(2.0 * lng * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(lng * math.pi) + 40.0 * math.sin(lng / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(lng / 12.0 * math.pi) + 300.0 * math.sin(lng / 30.0 * math.pi)) * 2.0 / 3.0
    return ret

# 百度墨卡托坐标转经纬度
def bd_mc_to_ll(x, y):
    """百度墨卡托坐标转百度经纬度坐标"""
    MCBAND = [12890594.86, 8362377.87, 5591021, 3481989.83, 1678043.12, 0]
    MC2LL = [
        [1.410526172116255e-8, 0.00000898305509648872, -1.9939833816331, 200.9824383106796, -187.2403703815547, 91.6087516669843, -23.38765649603339, 2.57121317296198, -0.03801003308653, 17337981.2],
        [-7.435856389565537e-9, 0.000008983055097726239, -0.78625201886289, 96.32687599759846, -1.85204757529826, -59.36935905485877, 47.40033549296737, -16.50741931063887, 2.28786674699375, 10260144.86],
        [-3.030883460898826e-8, 0.00000898305509983578, 0.30071316287616, 59.74293618442277, 7.357984074871, -25.38371002664745, 13.45380521110908, -3.29883767235584, 0.32710905363475, 6856817.37],
        [-1.981981304930552e-8, 0.000008983055099779535, 0.03278182852591, 40.31678527705744, 0.65659298677277, -4.44255534477492, 0.85341911805263, 0.12923347998204, -0.04625736007561, 4482777.06],
        [3.09191371068437e-9, 0.000008983055096812155, 0.00006995724062, 23.10934304144901, -0.00023663490511, -0.6321817810242, -0.00663494467273, 0.03430082397953, -0.00466043876332, 2555164.4],
        [2.890871144776878e-9, 0.000008983055095805407, -3.068298e-8, 7.47137025468032, -0.00000353937994, -0.02145144861037, -0.00001234426596, 0.00010322952773, -0.00000323890364, 826088.5]
    ]
    
    x = abs(x)
    y = abs(y)
    
    for i, band in enumerate(MCBAND):
        if y >= band:
            mc = MC2LL[i]
            break
    
    lng = mc[0] + mc[1] * abs(x)
    c = abs(y) / mc[9]
    lat = mc[2] + mc[3] * c + mc[4] * c * c + mc[5] * c * c * c + mc[6] * c * c * c * c + mc[7] * c * c * c * c * c + mc[8] * c * c * c * c * c * c
    
    lng *= -1 if x < 0 else 1
    lat *= -1 if y < 0 else 1
    
    return [lng, lat]

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 华侨抗战归国路景点数据（根据百度地图坐标转换为WGS84坐标）
# 将百度墨卡托坐标转换为正确的经纬度坐标
raw_attractions = [
    {'name': '台山梅家大院', 'baidu_coords': [12551773.53, 2501388.26], 'id': 1, 'day': 1, 'order': 1},
    {'name': '开平南楼七烈士纪念园', 'baidu_coords': [12539852.85, 2537446.73], 'id': 2, 'day': 1, 'order': 2},
    {'name': '赤坎古镇', 'baidu_coords': [12534451.44, 2534779.45], 'id': 3, 'day': 1, 'order': 3},
    {'name': '司徒美堂故居', 'baidu_coords': [12537665.41, 2536312.91], 'id': 4, 'day': 2, 'order': 1},
    {'name': '周文雍陈铁军烈士陵园', 'baidu_coords': [12525813.30, 2530891.98], 'id': 5, 'day': 2, 'order': 2},
    {'name': '君堂镇', 'baidu_coords': [12517163.02, 2533219.03], 'id': 6, 'day': 2, 'order': 3}
]

# 转换坐标并构建完整景点数据
ATTRACTIONS = []
for raw in raw_attractions:
    # 百度墨卡托坐标转百度经纬度
    bd_lng, bd_lat = bd_mc_to_ll(raw['baidu_coords'][0], raw['baidu_coords'][1])
    # 百度经纬度转WGS84
    wgs_lng, wgs_lat = bd09_to_wgs84(bd_lng, bd_lat)
    
    if raw['id'] == 1:
        attraction = {
            "id": 1,
            "name": "台山梅家大院",
            "lat": wgs_lat,
            "lng": wgs_lng,
            "description": "华侨募捐抗战的重要见证地，体验VR华侨募捐大会，虚拟签署《救国宣言》",
            "type": "华侨抗战景点",
            "rating": 4.8,
            "visit_time": "90分钟",
            "tags": ["华侨历史", "VR体验", "募捐大会"],
            "day": 1,
            "order": 1,
            "experience": "VR体验华侨募捐大会，虚拟签署《救国宣言》",
            "transport": "起点站",
            "distance_to_next": "30km",
            "drive_time": "40分钟",
            "baidu_coords": [12551773.53, 2501388.26]
        }
    elif raw['id'] == 2:
        attraction = {
            "id": 2,
            "name": "开平南楼七烈士纪念园",
            "lat": wgs_lat,
            "lng": wgs_lng,
            "description": "七烈士英勇阻击日军的历史见证地，3D还原战斗场景，听子弹轨迹音效",
            "type": "华侨抗战景点",
            "rating": 4.9,
            "visit_time": "60分钟",
            "tags": ["七烈士", "3D体验", "抗战历史"],
            "day": 1,
            "order": 2,
            "experience": "3D还原七烈士阻击日军战斗，听子弹轨迹音效",
            "transport": "距离台山梅家大院30km，车程40分钟",
            "distance_to_next": "15km",
            "drive_time": "25分钟",
            "baidu_coords": [12539852.85, 2537446.73]
        }
    elif raw['id'] == 3:
        attraction = {
            "id": 3,
            "name": "赤坎古镇",
            "lat": wgs_lat,
            "lng": wgs_lng,
            "description": "华侨情报站旧址，夜宿体验剧本杀《侨乡情报站》，扮演华侨传递密信",
            "type": "华侨抗战景点",
            "rating": 4.7,
            "visit_time": "120分钟+夜宿",
            "tags": ["情报站", "剧本杀", "夜宿体验"],
            "day": 1,
            "order": 3,
            "experience": "剧本杀《侨乡情报站》：扮演华侨传递密信，夜宿沉浸体验",
            "transport": "距离南楼15km，车程25分钟",
            "distance_to_next": "5km",
            "drive_time": "10分钟",
            "baidu_coords": [12534451.44, 2534779.45]
        }
    elif raw['id'] == 4:
        attraction = {
            "id": 4,
            "name": "司徒美堂故居",
            "lat": wgs_lat,
            "lng": wgs_lng,
            "description": "致公党领袖司徒美堂故居，AR重现海外动员演讲（粤语原声）",
            "type": "华侨抗战景点",
            "rating": 4.6,
            "visit_time": "60分钟",
            "tags": ["司徒美堂", "AR体验", "致公党"],
            "day": 2,
            "order": 1,
            "experience": "AR重现致公党海外动员演讲（粤语原声）",
            "transport": "距离赤坎古镇5km，车程10分钟",
            "distance_to_next": "20km",
            "drive_time": "30分钟",
            "baidu_coords": [12537665.41, 2536312.91]
        }
    elif raw['id'] == 5:
        attraction = {
            "id": 5,
            "name": "周文雍陈铁军烈士陵园",
            "lat": wgs_lat,
            "lng": wgs_lng,
            "description": "革命烈士陵园，全息投影《刑场上的婚礼》，写电子纪念信",
            "type": "华侨抗战景点",
            "rating": 4.8,
            "visit_time": "60分钟",
            "tags": ["革命烈士", "全息投影", "爱情信仰"],
            "day": 2,
            "order": 2,
            "experience": "全息投影《刑场上的婚礼》，写电子纪念信",
            "transport": "距离司徒美堂故居20km，车程30分钟",
            "distance_to_next": "10km",
            "drive_time": "15分钟",
            "baidu_coords": [12525813.30, 2530891.98]
        }
    elif raw['id'] == 6:
        attraction = {
            "id": 6,
            "name": "君堂镇",
            "lat": wgs_lat,
            "lng": wgs_lng,
            "description": "抗战物资装船码头，模拟抗战物资装船：搬运木箱，扫描看物资清单",
            "type": "华侨抗战景点",
            "rating": 4.5,
            "visit_time": "90分钟",
            "tags": ["物资装船", "互动体验", "抗战支援"],
            "day": 2,
            "order": 3,
            "experience": "模拟抗战物资装船：搬运木箱，扫描看物资清单",
            "transport": "距离周文雍陵园10km，车程15分钟",
            "distance_to_next": "终点站",
            "drive_time": "行程结束",
            "baidu_coords": [12517163.02, 2533219.03]
        }
    
    ATTRACTIONS.append(attraction)

# AI回复模板
AI_RESPONSES = {
    "greeting": [
        "您好！我是华侨抗战归国路AI导游，将带您重走华侨抗战历史足迹！",
        "欢迎体验华侨抗战归国路！我将为您规划一段穿越历史的沉浸之旅。",
        "您好！我是您的专属AI导游，准备好体验华侨万里归国救国的壮烈历程了吗？"
    ],
    "route_overview": [
        "🎯 华侨抗战归国路是一条充满历史意义的两日游路线，让您深度体验华侨万里归国救国的壮烈历程！",
        "🌟 这条路线通过VR、AR、3D等沉浸式技术，完整还原华侨从海外募捐到回国参战的感人故事。",
        "📖 跟随华侨先辈的足迹，体验从募捐大会到刑场婚礼的完整历史画卷。"
    ],
    "day1_route": [
        "🌅 第一天的行程将带您体验华侨海外募捐、回国参战和情报斗争的历程。",
        "🎬 通过VR体验募捐大会、3D还原阻击战斗、剧本杀体验谍战生活。"
    ],
    "day2_route": [
        "🌄 第二天将深入了解华侨的理想献身精神和爱情信仰故事。",
        "💕 从司徒美堂的海外动员到周文雍陈铁军的刑场婚礼，感受信仰的力量。"
    ],
    "immersive_experience": [
        "每个站点都有独特的沉浸式体验设计：",
        "五感沉浸体验让历史重现眼前：",
        "通过VR、AR、3D等技术，让您身临其境感受历史："
    ],
    "cultural": [
        "🏛️ 华侨抗战文化是中华民族抗战史上的重要篇章，这些景点承载着深厚的历史文化内涵。",
        "📚 每个景点都有独特的文化价值和教育意义。"
    ],
    "historical": [
        "📖 这些历史景点见证了华侨同胞万里归国、共赴国难的壮烈历程。",
        "🎭 通过现代科技手段，我们将历史重现，让您感受那个时代的风云变幻。"
    ],
    "experience_details": [
        "🎮 我们的沉浸式体验采用了最新的VR、AR、3D和全息投影技术！",
        "🎯 每个景点都有独特的互动体验，让您身临其境感受历史。"
    ],
    "nearby": [
        "📍 根据您的位置，我为您推荐以下附近的华侨抗战相关景点：",
        "🗺️ 这些景点距离您较近，适合就近游览。"
    ],
    "recommendation": [
        "⭐ 为您推荐华侨抗战归国路的精华景点：",
        "🎯 这些景点最能体现华侨抗战的历史价值和文化内涵。"
    ],
    "route": [
        "🗺️ 华侨抗战归国路为您提供完整的两日游行程规划！",
        "📅 我来为您详细介绍这条充满历史意义的路线安排。"
    ],
    "default": [
        "您好！我是华侨抗战归国路的AI导游。您可以询问路线安排、景点介绍、体验项目等信息。",
        "欢迎了解华侨抗战归国路！我可以为您介绍两日游行程、沉浸式体验和历史文化背景。",
        "我是您的专属AI导游，专门为华侨抗战归国路提供服务。有什么想了解的吗？"
    ]
}

def get_random_response(category):
    """获取随机回复"""
    return random.choice(AI_RESPONSES.get(category, AI_RESPONSES["greeting"]))

def calculate_distance(lat1, lng1, lat2, lng2):
    """计算两点间距离（简化版）"""
    import math
    
    # 将度数转换为弧度
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    
    # 计算差值
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    
    # 使用半正矢公式
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # 地球半径（公里）
    r = 6371
    
    return c * r

def find_nearby_attractions(user_lat, user_lng, radius=10):
    """查找附近景点"""
    nearby = []
    for attraction in ATTRACTIONS:
        distance = calculate_distance(user_lat, user_lng, attraction['lat'], attraction['lng'])
        if distance <= radius:
            attraction_copy = attraction.copy()
            attraction_copy['distance'] = round(distance, 2)
            nearby.append(attraction_copy)
    
    # 按距离排序
    nearby.sort(key=lambda x: x['distance'])
    return nearby

def analyze_user_intent(message):
    """分析用户意图"""
    message_lower = message.lower()
    
    intent_keywords = {
        'nearby': ['附近', '最近', '周边', '身边'],
        'route': ['路线', '规划', '导航', '怎么去', '如何到'],
        'cultural': ['文化', '历史', '传统', '艺术', '博物馆'],
        'historical': ['历史', '古迹', '遗址', '纪念'],
        'recommendation': ['推荐', '建议', '好玩', '有趣', '值得'],
        'quiet': ['安静', '清静', '宁静', '幽静'],
        'modern': ['现代', '时尚', '新潮', '科技']
    }
    
    detected_intents = []
    for intent, keywords in intent_keywords.items():
        if any(keyword in message_lower for keyword in keywords):
            detected_intents.append(intent)
    
    return detected_intents if detected_intents else ['general']

@app.route('/')
def index():
    """主页"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """静态文件服务"""
    return send_from_directory('.', filename)

@app.route('/api/chat', methods=['POST'])
def chat():
    """AI对话接口"""
    try:
        data = request.get_json()
        user_message = data.get('message', '').strip()
        user_location = data.get('location', {})
        
        if not user_message:
            return jsonify({
                'success': False,
                'error': '消息不能为空'
            }), 400
        
        # 分析用户意图
        intents = analyze_user_intent(user_message)
        
        # 模拟AI处理时间
        time.sleep(1)
        
        response_data = {
            'success': True,
            'message': '',
            'attractions': [],
            'route_suggestions': [],
            'timestamp': datetime.now().isoformat()
        }
        
        # 根据意图生成回复
        if 'route' in intents or '路线' in user_message or '行程' in user_message:
            response_msg = get_random_response('route_overview')
            response_msg += "\n\n📍 **第一天行程（Day 1）**\n"
            
            day1_attractions = [a for a in ATTRACTIONS if a.get('day') == 1]
            for attraction in sorted(day1_attractions, key=lambda x: x.get('order', 0)):
                response_msg += f"🔸 {attraction['name']}\n"
                response_msg += f"   📱 {attraction['experience']}\n"
                response_msg += f"   ⏱️ 游览时间：{attraction['visit_time']}\n"
                if attraction.get('distance_to_next') != '终点站':
                    response_msg += f"   🚗 {attraction['transport']}\n\n"
                else:
                    response_msg += "\n"
            
            response_msg += "📍 **第二天行程（Day 2）**\n"
            day2_attractions = [a for a in ATTRACTIONS if a.get('day') == 2]
            for attraction in sorted(day2_attractions, key=lambda x: x.get('order', 0)):
                response_msg += f"🔸 {attraction['name']}\n"
                response_msg += f"   📱 {attraction['experience']}\n"
                response_msg += f"   ⏱️ 游览时间：{attraction['visit_time']}\n"
                if attraction.get('distance_to_next') != '终点站':
                    response_msg += f"   🚗 {attraction['transport']}\n\n"
                else:
                    response_msg += "\n"
            
            response_msg += "\n📊 **路线总览**\n"
            response_msg += "• 总里程：80公里\n"
            response_msg += "• 总时长：2天（游览8h + 车程2h + 夜宿1h）\n"
            response_msg += "• 交通：跟团大巴统一调度\n"
            response_msg += "• 特色：VR+AR+3D+全息投影沉浸体验"
            
            response_data['attractions'] = ATTRACTIONS
            response_data['message'] = response_msg
            
            response_data['route_suggestions'] = [
                {
                    'name': '华侨抗战归国路（完整版）',
                    'attractions': [1, 2, 3, 4, 5, 6],
                    'duration': '2天1夜',
                    'description': '完整体验华侨万里归国救国的壮烈历程'
                },
                {
                    'name': 'Day1精华路线',
                    'attractions': [1, 2, 3],
                    'duration': '1天',
                    'description': '海外募捐→回国参战→情报斗争'
                },
                {
                    'name': 'Day2精华路线',
                    'attractions': [4, 5, 6],
                    'duration': '1天',
                    'description': '理想献身→爱情信仰→物资支援'
                }
            ]
        
        elif 'cultural' in intents or '文化' in user_message:
            cultural_attractions = ATTRACTIONS  # 所有景点都是华侨抗战文化景点
            response_data['attractions'] = cultural_attractions
            
            response_msg = get_random_response('cultural')
            response_msg += "\n\n"
            for i, attraction in enumerate(cultural_attractions, 1):
                tags_str = "、".join(attraction['tags'])
                response_msg += f"{i}. {attraction['name']}\n"
                response_msg += f"   📍 {attraction['description']}\n"
                response_msg += f"   🏷️ 特色：{tags_str}\n"
                response_msg += f"   ⏱️ 推荐游览时间：{attraction['visit_time']}\n\n"
            
            response_data['message'] = response_msg
        
        elif 'historical' in intents or '历史' in user_message:
            response_msg = get_random_response('historical')
            response_msg += "\n\n"
            for i, attraction in enumerate(ATTRACTIONS, 1):
                response_msg += f"{i}. {attraction['name']}\n"
                response_msg += f"   📖 {attraction['description']}\n"
                response_msg += f"   ⭐ 评分：{attraction['rating']}/5.0\n"
                response_msg += f"   📅 第{attraction['day']}天行程\n\n"
            
            response_data['attractions'] = ATTRACTIONS
            response_data['message'] = response_msg
        
        elif 'experience' in intents or '体验' in user_message or 'VR' in user_message or 'AR' in user_message:
            response_msg = get_random_response('experience_details')
            response_msg += "\n\n"
            
            for attraction in ATTRACTIONS:
                response_msg += f"🎯 **{attraction['name']}**\n"
                response_msg += f"   {attraction['experience']}\n\n"
            
            response_msg += "💡 **技术亮点**\n"
            response_msg += "• VR虚拟现实：身临其境参与募捐大会\n"
            response_msg += "• 3D立体音效：听到真实的子弹轨迹声\n"
            response_msg += "• AR增强现实：重现历史人物演讲\n"
            response_msg += "• 全息投影：观看刑场上的婚礼\n"
            response_msg += "• 互动体验：亲手搬运抗战物资"
            
            response_data['attractions'] = ATTRACTIONS
            response_data['message'] = response_msg
        
        elif '第一天' in user_message or 'day1' in user_message.lower():
            day1_attractions = [a for a in ATTRACTIONS if a.get('day') == 1]
            response_msg = get_random_response('day1_route')
            response_msg += "\n\n"
            
            for attraction in sorted(day1_attractions, key=lambda x: x.get('order', 0)):
                response_msg += f"📍 **{attraction['name']}**\n"
                response_msg += f"   🎬 {attraction['experience']}\n"
                response_msg += f"   ⏰ {attraction['visit_time']}\n"
                response_msg += f"   🚗 {attraction['transport']}\n\n"
            
            response_data['attractions'] = day1_attractions
            response_data['message'] = response_msg
        
        elif '第二天' in user_message or 'day2' in user_message.lower():
            day2_attractions = [a for a in ATTRACTIONS if a.get('day') == 2]
            response_msg = get_random_response('day2_route')
            response_msg += "\n\n"
            
            for attraction in sorted(day2_attractions, key=lambda x: x.get('order', 0)):
                response_msg += f"📍 **{attraction['name']}**\n"
                response_msg += f"   🎬 {attraction['experience']}\n"
                response_msg += f"   ⏰ {attraction['visit_time']}\n"
                response_msg += f"   🚗 {attraction['transport']}\n\n"
            
            response_data['attractions'] = day2_attractions
            response_data['message'] = response_msg
        
        elif 'nearby' in intents and user_location:
            user_lat = user_location.get('lat')
            user_lng = user_location.get('lng')
            
            if user_lat and user_lng:
                nearby_attractions = find_nearby_attractions(user_lat, user_lng)
                response_data['attractions'] = nearby_attractions[:3]
                
                response_msg = get_random_response('nearby')
                if nearby_attractions:
                    response_msg += "\n\n"
                    for i, attraction in enumerate(nearby_attractions[:3], 1):
                        response_msg += f"{i}. {attraction['name']} ({attraction['distance']}km)\n   {attraction['description']}\n\n"
                else:
                    response_msg += "\n\n抱歉，您附近暂时没有找到相关景点。"
                
                response_data['message'] = response_msg
        
        elif 'recommendation' in intents:
            # 推荐华侨抗战路线
            response_msg = get_random_response('recommendation')
            response_msg += "\n\n"
            for i, attraction in enumerate(ATTRACTIONS[:3], 1):
                tags_str = "、".join(attraction['tags'])
                response_msg += f"{i}. {attraction['name']}\n   {attraction['description']}\n   特色：{tags_str}\n\n"
            
            response_data['attractions'] = ATTRACTIONS[:3]
            response_data['message'] = response_msg
        
        else:
            # 通用回复
            response_data['message'] = (
                "我理解您的需求。您可以尝试这样问我：\n\n"
                "• '推荐附近的景点'\n"
                "• '我想了解文化景点'\n"
                "• '规划一条观光路线'\n"
                "• '有什么历史景点推荐'\n\n"
                "我会根据您的需求为您提供最合适的建议！"
            )
        
        return jsonify(response_data)
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'服务器错误：{str(e)}'
        }), 500

@app.route('/api/attractions', methods=['GET'])
def get_attractions():
    """获取所有景点信息"""
    return jsonify({
        'success': True,
        'attractions': ATTRACTIONS
    })

@app.route('/api/route', methods=['POST'])
def plan_route():
    """路线规划接口"""
    try:
        data = request.get_json()
        start_location = data.get('start')
        end_location = data.get('end')
        
        if not start_location or not end_location:
            return jsonify({
                'success': False,
                'error': '起点和终点信息不完整'
            }), 400
        
        # 模拟路线规划
        route_data = {
            'success': True,
            'route': {
                'distance': round(calculate_distance(
                    start_location['lat'], start_location['lng'],
                    end_location['lat'], end_location['lng']
                ), 2),
                'duration': '约15-30分钟',
                'steps': [
                    '从起点出发',
                    '沿主要道路前行',
                    '到达目的地'
                ],
                'waypoints': [
                    [start_location['lat'], start_location['lng']],
                    [end_location['lat'], end_location['lng']]
                ]
            }
        }
        
        return jsonify(route_data)
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'路线规划失败：{str(e)}'
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })

if __name__ == '__main__':
    print("🚀 AI智能游径规划系统启动中...")
    print("📍 访问地址: http://localhost:5000")
    print("🤖 AI助手已就绪，随时为您服务！")
    
    # 检查静态文件是否存在
    required_files = ['index.html', 'styles.css', 'app.js']
    for file in required_files:
        if not os.path.exists(file):
            print(f"⚠️  警告: 缺少文件 {file}")
    
    app.run(host='0.0.0.0', port=5000, debug=True)