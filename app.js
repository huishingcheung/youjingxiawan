// 全局变量
let map;
let userLocation = null;
let routeControl = null;
let markers = [];

// 坐标转换函数
function bd09ToWgs84(bdLng, bdLat) {
    // BD09 to GCJ02
    const x = bdLng - 0.0065;
    const y = bdLat - 0.006;
    const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI);
    const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI);
    const gcjLng = z * Math.cos(theta);
    const gcjLat = z * Math.sin(theta);
    
    // GCJ02 to WGS84
    const dlat = transformLat(gcjLng - 105.0, gcjLat - 35.0);
    const dlng = transformLng(gcjLng - 105.0, gcjLat - 35.0);
    const radlat = gcjLat / 180.0 * Math.PI;
    let magic = Math.sin(radlat);
    magic = 1 - 0.00669342162296594323 * magic * magic;
    const sqrtmagic = Math.sqrt(magic);
    const dlatFinal = (dlat * 180.0) / ((6378245.0 * (1 - 0.00669342162296594323)) / (magic * sqrtmagic) * Math.PI);
    const dlngFinal = (dlng * 180.0) / (6378245.0 / sqrtmagic * Math.cos(radlat) * Math.PI);
    const mglat = gcjLat - dlatFinal;
    const mglng = gcjLng - dlngFinal;
    return [mglng, mglat];
}

function transformLat(lng, lat) {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(lng, lat) {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}

// 百度墨卡托坐标转经纬度
function bdMcToLl(x, y) {
    const MCBAND = [12890594.86, 8362377.87, 5591021, 3481989.83, 1678043.12, 0];
    const MC2LL = [
        [1.410526172116255e-8, 0.00000898305509648872, -1.9939833816331, 200.9824383106796, -187.2403703815547, 91.6087516669843, -23.38765649603339, 2.57121317296198, -0.03801003308653, 17337981.2],
        [-7.435856389565537e-9, 0.000008983055097726239, -0.78625201886289, 96.32687599759846, -1.85204757529826, -59.36935905485877, 47.40033549296737, -16.50741931063887, 2.28786674699375, 10260144.86],
        [-3.030883460898826e-8, 0.00000898305509983578, 0.30071316287616, 59.74293618442277, 7.357984074871, -25.38371002664745, 13.45380521110908, -3.29883767235584, 0.32710905363475, 6856817.37],
        [-1.981981304930552e-8, 0.000008983055099779535, 0.03278182852591, 40.31678527705744, 0.65659298677277, -4.44255534477492, 0.85341911805263, 0.12923347998204, -0.04625736007561, 4482777.06],
        [3.09191371068437e-9, 0.000008983055096812155, 0.00006995724062, 23.10934304144901, -0.00023663490511, -0.6321817810242, -0.00663494467273, 0.03430082397953, -0.00466043876332, 2555164.4],
        [2.890871144776878e-9, 0.000008983055095805407, -3.068298e-8, 7.47137025468032, -0.00000353937994, -0.02145144861037, -0.00001234426596, 0.00010322952773, -0.00000323890364, 826088.5]
    ];
    
    x = Math.abs(x);
    y = Math.abs(y);
    
    let mc;
    for (let i = 0; i < MCBAND.length; i++) {
        if (y >= MCBAND[i]) {
            mc = MC2LL[i];
            break;
        }
    }
    
    let lng = mc[0] + mc[1] * Math.abs(x);
    const c = Math.abs(y) / mc[9];
    let lat = mc[2] + mc[3] * c + mc[4] * c * c + mc[5] * c * c * c + mc[6] * c * c * c * c + mc[7] * c * c * c * c * c + mc[8] * c * c * c * c * c * c;
    
    lng *= x < 0 ? -1 : 1;
    lat *= y < 0 ? -1 : 1;
    
    return [lng, lat];
}

// 华侨抗战归国路景点数据（根据百度地图坐标转换）
const rawAttractions = [
    {name: '台山梅家大院', baiduCoords: [12551773.53, 2501388.26], id: 1, day: 1, order: 1},
    {name: '开平南楼七烈士纪念园', baiduCoords: [12539852.85, 2537446.73], id: 2, day: 1, order: 2},
    {name: '赤坎古镇', baiduCoords: [12534451.44, 2534779.45], id: 3, day: 1, order: 3},
    {name: '司徒美堂故居', baiduCoords: [12537665.41, 2536312.91], id: 4, day: 2, order: 4},
    {name: '周文雍陈铁军烈士陵园', baiduCoords: [12525813.30, 2530891.98], id: 5, day: 2, order: 5},
    {name: '君堂镇', baiduCoords: [12517163.02, 2533219.03], id: 6, day: 2, order: 6}
];

// 转换坐标并构建完整景点数据
const attractions = [];
rawAttractions.forEach(raw => {
    // 百度墨卡托坐标转百度经纬度
    const [bdLng, bdLat] = bdMcToLl(raw.baiduCoords[0], raw.baiduCoords[1]);
    // 百度经纬度转WGS84
    const [wgsLng, wgsLat] = bd09ToWgs84(bdLng, bdLat);
    
    let attraction;
    if (raw.id === 1) {
        attraction = {
            id: 1,
            name: "台山梅家大院",
            lat: wgsLat,
            lng: wgsLng,
            description: "华侨建筑群，体验VR华侨募捐大会",
            type: "华侨抗战景点",
            rating: 4.8,
            visit_time: "90分钟",
            tags: ["VR体验", "华侨文化", "募捐历史"],
            day: 1,
            order: 1,
            experience: "VR体验'华侨募捐大会'，虚拟签署《救国宣言》",
            transport: "起点站",
            distance_to_next: "30km/40min"
        };
    } else if (raw.id === 2) {
        attraction = {
            id: 2,
            name: "开平南楼七烈士纪念园",
            lat: wgsLat,
            lng: wgsLng,
            description: "七烈士英勇阻击日军的历史见证地",
            type: "华侨抗战景点",
            rating: 4.9,
            visit_time: "60分钟",
            tags: ["3D体验", "抗战历史", "英雄事迹"],
            day: 1,
            order: 2,
            experience: "3D还原'七烈士阻击日军'战斗，听子弹轨迹音效",
            transport: "大巴前往赤坎古镇",
            distance_to_next: "15km/25min"
        };
    } else if (raw.id === 3) {
        attraction = {
            id: 3,
            name: "赤坎古镇",
            lat: wgsLat,
            lng: wgsLng,
            description: "侨乡古镇，夜宿体验剧本杀",
            type: "华侨抗战景点",
            rating: 4.7,
            visit_time: "120分钟",
            tags: ["剧本杀", "夜宿体验", "情报斗争"],
            day: 1,
            order: 3,
            experience: "剧本杀《侨乡情报站》：扮演华侨传递密信",
            transport: "夜宿古镇",
            distance_to_next: "5km/10min"
        };
    } else if (raw.id === 4) {
        attraction = {
            id: 4,
            name: "司徒美堂故居",
            lat: wgsLat,
            lng: wgsLng,
            description: "致公党创始人故居，AR重现历史演讲",
            type: "华侨抗战景点",
            rating: 4.6,
            visit_time: "60分钟",
            tags: ["AR体验", "政治家", "海外动员"],
            day: 2,
            order: 4,
            experience: "AR重现'致公党海外动员演讲'（粤语原声）",
            transport: "大巴前往陵园",
            distance_to_next: "20km/30min"
        };
    } else if (raw.id === 5) {
        attraction = {
            id: 5,
            name: "周文雍陈铁军烈士陵园",
            lat: wgsLat,
            lng: wgsLng,
            description: "革命伉俪长眠地，全息投影刑场婚礼",
            type: "华侨抗战景点",
            rating: 4.9,
            visit_time: "60分钟",
            tags: ["全息投影", "爱情信仰", "革命精神"],
            day: 2,
            order: 5,
            experience: "全息投影《刑场上的婚礼》，写电子纪念信",
            transport: "大巴前往君堂镇",
            distance_to_next: "10km/15min"
        };
    } else if (raw.id === 6) {
        attraction = {
            id: 6,
            name: "君堂镇",
            lat: wgsLat,
            lng: wgsLng,
            description: "抗战物资集散地，模拟装船体验",
            type: "华侨抗战景点",
            rating: 4.5,
            visit_time: "90分钟",
            tags: ["互动体验", "物资支援", "抗战后勤"],
            day: 2,
            order: 6,
            experience: "模拟'抗战物资装船'：搬运木箱，扫描看物资清单",
            transport: "返程",
            distance_to_next: "终点站"
        };
    }
    
    attractions.push(attraction);
});

// AI回复模板
const aiResponses = {
    greeting: [
        "您好！我是您的AI导航助手，很高兴为您服务！",
        "欢迎使用AI智能游径规划系统！",
        "您好！请告诉我您想去哪里，我来为您规划路线。"
    ],
    nearbyAttractions: [
        "根据您的位置，我为您推荐以下附近的景点：",
        "这里有一些您附近的热门景点：",
        "让我为您找找附近有趣的地方："
    ],
    routePlanning: [
        "我已经为您规划了最佳路线，请查看地图！",
        "路线规划完成！建议您按照地图上的路线前往。",
        "根据当前交通情况，这是最优路线。"
    ],
    recommendations: [
        "基于您的偏好，我推荐以下景点：",
        "这些地方可能符合您的需求：",
        "让我为您推荐一些特别的地方："
    ]
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    initializeMap();
    initializeEventListeners();
    loadGalleryImages();
    addAttractionMarkers();
    
    // 显示欢迎消息
    setTimeout(() => {
        addBotMessage(getRandomResponse(aiResponses.greeting));
    }, 1000);
}

// 初始化地图
function initializeMap() {
    // 创建地图实例，中心设置为台山市（华侨抗战路线的起点）
    map = L.map('map').setView([22.2515, 112.7813], 10);
    
    // 添加地图瓦片层 - 使用高德地图作为底图
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        attribution: '© 高德地图',
        subdomains: ['1', '2', '3', '4'],
        maxZoom: 18
    }).addTo(map);
    
    // 尝试获取用户位置
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // 添加用户位置标记
                const userMarker = L.marker([userLocation.lat, userLocation.lng])
                    .addTo(map)
                    .bindPopup('您的当前位置')
                    .openPopup();
                
                // 将地图中心移动到用户位置
                map.setView([userLocation.lat, userLocation.lng], 14);
            },
            error => {
                console.log('无法获取位置信息:', error);
                addBotMessage('无法获取您的位置信息，将使用默认位置。');
            }
        );
    }
}

// 全局路线图层变量
let routeLayer = null;

// 添加景点标记
function addAttractionMarkers() {
    attractions.forEach(attraction => {
        // 根据天数设置不同颜色的标记
        const iconColor = attraction.day === 1 ? 'red' : 'blue';
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div class="marker-pin marker-${iconColor}">
                     <span class="marker-number">${attraction.order}</span>
                   </div>`,
            iconSize: [30, 40],
            iconAnchor: [15, 40]
        });
        
        const marker = L.marker([attraction.lat, attraction.lng], { icon: customIcon })
            .addTo(map)
            .bindPopup(`
                <div class="popup-content">
                    <h3>🎯 ${attraction.name}</h3>
                    <p><strong>📍 位置：</strong>${attraction.description}</p>
                    <p><strong>🎬 体验：</strong>${attraction.experience}</p>
                    <p><strong>⏰ 时长：</strong>${attraction.visit_time}</p>
                    <p><strong>⭐ 评分：</strong>${attraction.rating}/5.0</p>
                    <p><strong>🏷️ 标签：</strong>${attraction.tags.join('、')}</p>
                    <p><strong>📅 行程：</strong>第${attraction.day}天</p>
                    ${attraction.distance_to_next !== '终点站' ? 
                        `<p><strong>🚗 交通：</strong>${attraction.transport}</p>` : 
                        '<p><strong>🏁 终点站</strong></p>'}
                    <br>
                    <button onclick="planRouteTo(${attraction.lat}, ${attraction.lng}, '${attraction.name}')" 
                            class="route-btn">规划路线</button>
                </div>
            `);
        
        markers.push(marker);
    });
    
    // 绘制真实路线（在标记添加完成后）
    setTimeout(() => {
        drawRouteLines();
    }, 1000);
}

// 实现真实路线规划
function drawRouteLines() {
    // 清除现有路线
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
    
    routeLayer = L.layerGroup().addTo(map);
    
    // 由于使用的是Leaflet地图，我们需要使用第三方路线规划服务
    // 这里实现一个简化的路线规划，连接相邻景点
    drawSimpleRoutes();
}

// 绘制简化路线（连接相邻景点）
function drawSimpleRoutes() {
    // 按天数和顺序排序景点
    const sortedAttractions = attractions.sort((a, b) => {
        if (a.day !== b.day) {
            return a.day - b.day;
        }
        return a.order - b.order;
    });
    
    // 为每对相邻景点绘制路线
    for (let i = 0; i < sortedAttractions.length - 1; i++) {
        const current = sortedAttractions[i];
        const next = sortedAttractions[i + 1];
        
        // 使用OpenRouteService或其他路线规划服务
        drawRouteBetweenPoints(current, next, i);
    }
}

// 在两个景点之间绘制路线
function drawRouteBetweenPoints(start, end, index) {
    // 使用OpenRouteService API进行路线规划
    const apiKey = '5b3ce3597851110001cf6248d91b7c8b8c5b4b5b9c8e4a4b8c5b4b5b'; // 示例key，实际使用时需要申请
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                const coordinates = data.features[0].geometry.coordinates;
                // 转换坐标格式 [lng, lat] -> [lat, lng]
                const latLngs = coordinates.map(coord => [coord[1], coord[0]]);
                
                // 根据天数设置不同颜色
                const color = start.day === 1 ? '#ff4444' : '#4444ff';
                
                // 绘制路线
                const polyline = L.polyline(latLngs, {
                    color: color,
                    weight: 4,
                    opacity: 0.8
                }).addTo(routeLayer);
                
                // 添加路线信息弹窗
                polyline.bindPopup(`
                    <div class="route-popup">
                        <h4>路线信息</h4>
                        <p><strong>从:</strong> ${start.name}</p>
                        <p><strong>到:</strong> ${end.name}</p>
                        <p><strong>距离:</strong> ${start.distance_to_next || '计算中...'}</p>
                        <p><strong>交通方式:</strong> ${start.transport || '步行'}</p>
                    </div>
                `);
            }
        })
        .catch(error => {
            console.log('路线规划失败，使用直线连接:', error);
            // 如果API调用失败，使用直线连接作为备选方案
            const color = start.day === 1 ? '#ff4444' : '#4444ff';
            const polyline = L.polyline([[start.lat, start.lng], [end.lat, end.lng]], {
                color: color,
                weight: 3,
                opacity: 0.6,
                dashArray: '10, 10'
            }).addTo(routeLayer);
            
            polyline.bindPopup(`
                <div class="route-popup">
                    <h4>路线信息</h4>
                    <p><strong>从:</strong> ${start.name}</p>
                    <p><strong>到:</strong> ${end.name}</p>
                    <p><strong>距离:</strong> ${start.distance_to_next || '约' + Math.round(calculateDistance(start.lat, start.lng, end.lat, end.lng)) + 'km'}</p>
                    <p><strong>交通方式:</strong> ${start.transport || '步行'}</p>
                </div>
            `);
        });
}

// 计算两点间距离（公里）
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球半径（公里）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// 初始化事件监听器
function initializeEventListeners() {
    // 标签页切换
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });
    
    // 发送消息
    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('user-input');
    
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // 快捷按钮
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const query = this.dataset.query;
            userInput.value = query;
            sendMessage();
        });
    });
    
    // 地图控制按钮
    document.getElementById('locate-btn').addEventListener('click', locateUser);
    document.getElementById('clear-route').addEventListener('click', clearRoute);
}

// 切换标签页
function switchTab(tabName) {
    // 更新导航按钮状态
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // 显示对应内容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // 如果切换到地图标签，刷新地图大小
    if (tabName === 'map') {
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }
}

// 发送消息
function sendMessage() {
    const userInput = document.getElementById('user-input');
    const message = userInput.value.trim();
    
    if (!message) return;
    
    // 添加用户消息
    addUserMessage(message);
    userInput.value = '';
    
    // 显示加载状态
    showLoading();
    
    // 模拟AI处理时间
    setTimeout(() => {
        processUserMessage(message);
        hideLoading();
    }, 1500);
}

// 添加用户消息
function addUserMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-user"></i>
        </div>
        <div class="message-content">
            <p>${message}</p>
            <span class="message-time">${getCurrentTime()}</span>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 添加AI消息
function addBotMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <p>${message}</p>
            <span class="message-time">${getCurrentTime()}</span>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 处理用户消息
function processUserMessage(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('最近') || lowerMessage.includes('附近')) {
        handleNearbyRequest();
    } else if (lowerMessage.includes('路线') || lowerMessage.includes('规划')) {
        handleRouteRequest(message);
    } else if (lowerMessage.includes('推荐') || lowerMessage.includes('建议')) {
        handleRecommendationRequest();
    } else if (lowerMessage.includes('安静') || lowerMessage.includes('清静')) {
        handleQuietPlaceRequest();
    } else {
        handleGeneralQuery(message);
    }
}

// 处理附近景点请求
function handleNearbyRequest() {
    let attractionList = "";
    
    attractions.forEach((attraction, index) => {
        attractionList += `${index + 1}. ${attraction.name}\n`;
    });
    
    addBotMessage(attractionList);
    
    // 在地图上高亮显示所有景点
    highlightAttractions(attractions);
}

// 处理路线规划请求
function handleRouteRequest(message) {
    const response = "华侨抗战归国路线规划：\n\n";
    let routeInfo = "";
    
    // 显示完整的六个景点路线
    attractions.forEach((attraction, index) => {
        routeInfo += `${index + 1}. ${attraction.name}\n`;
        routeInfo += `   📍 ${attraction.description}\n`;
        routeInfo += `   ⏰ 游览时间：${attraction.visit_time}\n`;
        if (attraction.distance_to_next !== "终点站") {
            routeInfo += `   🚗 ${attraction.distance_to_next}\n\n`;
        } else {
            routeInfo += "\n";
        }
    });
    
    addBotMessage(response + routeInfo);
    
    // 在地图上绘制完整路线
    drawRouteLines();
    
    // 高亮显示所有景点
    highlightAttractions(attractions);
}

// 处理推荐请求
function handleRecommendationRequest() {
    const response = getRandomResponse(aiResponses.recommendations);
    const randomAttractions = attractions.sort(() => 0.5 - Math.random()).slice(0, 2);
    
    let recommendationList = "\n\n";
    randomAttractions.forEach((attraction, index) => {
        recommendationList += `${index + 1}. ${attraction.name} - ${attraction.description}\n`;
    });
    
    addBotMessage(response + recommendationList);
    highlightAttractions(randomAttractions);
}

// 处理安静场所请求
function handleQuietPlaceRequest() {
    const quietPlaces = attractions.filter(a => a.type === '文化景点');
    let response = "为您推荐一些安静的文化场所：\n\n";
    
    quietPlaces.forEach((place, index) => {
        response += `${index + 1}. ${place.name} - ${place.description}\n`;
    });
    
    addBotMessage(response);
    highlightAttractions(quietPlaces);
}

// 处理一般查询
function handleGeneralQuery(message) {
    const responses = [
        "我理解您的需求，让我为您查找相关信息...",
        "根据您的描述，我建议您可以考虑以下选项：",
        "这是一个很好的问题！让我为您提供一些建议："
    ];
    
    const response = getRandomResponse(responses);
    const suggestion = "\n\n您可以尝试更具体地描述您的需求，比如：\n• 我想去历史景点\n• 推荐文化场所\n• 规划观光路线";
    
    addBotMessage(response + suggestion);
}

// 规划路线
function planRouteTo(lat, lng, name) {
    if (!userLocation) {
        addBotMessage('请先允许获取您的位置信息，以便为您规划路线。');
        return;
    }
    
    // 清除之前的路线
    clearRoute();
    
    // 创建路线控制
    routeControl = L.Routing.control({
        waypoints: [
            L.latLng(userLocation.lat, userLocation.lng),
            L.latLng(lat, lng)
        ],
        routeWhileDragging: true,
        addWaypoints: false,
        createMarker: function() { return null; }, // 不创建额外标记
        lineOptions: {
            styles: [{
                color: '#667eea',
                weight: 6,
                opacity: 0.8
            }]
        }
    }).addTo(map);
    
    addBotMessage(`已为您规划到${name}的路线，请查看地图！`);
}

// 清除路线
function clearRoute() {
    if (routeControl) {
        map.removeControl(routeControl);
        routeControl = null;
    }
}

// 定位用户
function locateUser() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                userLocation = { lat, lng };
                map.setView([lat, lng], 16);
                
                // 添加或更新用户位置标记
                L.marker([lat, lng])
                    .addTo(map)
                    .bindPopup('您的当前位置')
                    .openPopup();
            },
            error => {
                alert('无法获取您的位置信息');
            }
        );
    }
}

// 高亮显示景点
function highlightAttractions(attractionList) {
    // 清除之前的高亮
    markers.forEach(marker => {
        marker.setOpacity(0.6);
    });
    
    // 高亮指定景点
    attractionList.forEach(attraction => {
        const marker = markers.find(m => {
            const pos = m.getLatLng();
            return Math.abs(pos.lat - attraction.lat) < 0.001 && 
                   Math.abs(pos.lng - attraction.lng) < 0.001;
        });
        
        if (marker) {
            marker.setOpacity(1);
            marker.openPopup();
        }
    });
}

// 加载图库图片
function loadGalleryImages() {
    const galleryGrid = document.getElementById('gallery-grid');
    const imageFiles = [
        '微信图片_2025-06-17_165856_663.png',
        '微信图片_20250617180935_43.png',
        '微信图片_20250617180935_44.png'
    ];
    
    const imageDescriptions = [
        '华侨华人历史文化展示',
        '反法西斯历史纪念',
        '文化遗产保护展览'
    ];
    
    imageFiles.forEach((filename, index) => {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item';
        galleryItem.innerHTML = `
            <img src="${filename}" alt="景点图片${index + 1}" onerror="this.style.display='none'">
            <div class="gallery-item-info">
                <h3>景点图片 ${index + 1}</h3>
                <p>${imageDescriptions[index]}</p>
            </div>
        `;
        
        galleryItem.addEventListener('click', () => {
            openImageModal(filename, imageDescriptions[index]);
        });
        
        galleryGrid.appendChild(galleryItem);
    });
}

// 打开图片模态框
function openImageModal(imageSrc, description) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <img src="${imageSrc}" alt="景点图片">
            <p>${description}</p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 关闭模态框
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// 显示加载状态
function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

// 隐藏加载状态
function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

// 获取随机回复
function getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
}

// 获取当前时间
function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// 添加图片模态框样式
const modalStyles = `
.image-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.modal-content {
    position: relative;
    max-width: 90%;
    max-height: 90%;
    text-align: center;
}

.modal-content img {
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 10px;
}

.modal-content p {
    color: white;
    margin-top: 20px;
    font-size: 1.2rem;
}

.close-modal {
    position: absolute;
    top: -40px;
    right: 0;
    color: white;
    font-size: 2rem;
    cursor: pointer;
    z-index: 10001;
}

.close-modal:hover {
    color: #ccc;
}
`;

// 添加样式到页面
const styleSheet = document.createElement('style');
styleSheet.textContent = modalStyles;
document.head.appendChild(styleSheet);

// 添加路线规划库的CDN（如果需要）
if (typeof L.Routing === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js';
    document.head.appendChild(script);
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css';
    document.head.appendChild(link);
}