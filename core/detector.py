import cv2
import numpy as np
from ultralytics import YOLO
import os
import sys
from collections import deque, Counter
import logging
import time
import threading

from .filters import OneEuroFilter
from config import *

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class GuitarFingeringRecognizer:
    """
    吉他指法识别器（无后端MediaPipe版本）
    指板参数由YOLO检测获得，手部关键点由前端通过WebSocket传入（混合模式）
    """
    def __init__(self,
                 yolo_model_path=YOLO_MODEL_PATH,
                 hand_model_path=None,   # 不再使用，保留参数仅为兼容
                 num_strings=NUM_STRINGS,
                 num_frets=NUM_FRETS,
                 yolo_conf=YOLO_CONF,
                 hand_conf=HAND_CONF,
                 string_edge_shrink_ratio=STRING_EDGE_SHRINK_RATIO,
                 debug_mode=DEBUG_MODE,
                 draw_fret_numbers=DRAW_FRET_NUMBERS,
                 use_clahe=USE_CLAHE,
                 use_lost_frame_hold=False,
                 filter_mode=FILTER_MODE,
                 press_threshold_px=PRESS_THRESHOLD_PX,
                 string_dist_thresh=STRING_DIST_THRESH,
                 min_box_width=MIN_BOX_WIDTH,
                 one_euro_min_cutoff=ONE_EURO_MIN_CUTOFF,
                 one_euro_beta=ONE_EURO_BETA,
                 one_euro_dcutoff=ONE_EURO_DCUTOFF,
                 smooth_alpha=SMOOTH_ALPHA,
                 motion_threshold=MOTION_THRESHOLD,
                 motion_frames=MOTION_FRAMES,
                 max_hand_age_sec=0.3,
                 fret_history_len=FRET_HISTORY_LEN,
                 barre_angle_thresh=BARRE_ANGLE_THRESH,
                 barre_min_covered=BARRE_MIN_COVERED,
                 use_fixed_dist_thresh=USE_FIXED_DIST_THRESH,
                 fixed_dist_thresh=FIXED_DIST_THRESH,
                 dynamic_thresh_ratio=1.5,
                 pinky_press_threshold_px=PINKY_PRESS_THRESHOLD_PX,          
                 pinky_string_dist_thresh=PINKY_STRING_DIST_THRESH,           
                 pinky_fret_history_len=PINKY_FRET_HISTORY_LEN,               
                 pinky_smooth_alpha=PINKY_SMOOTH_ALPHA,                 
                 pinky_angle_thresh=PINKY_ANGLE_THRESH,                   
                 pinky_prefer_low_strings=False,
                 force_nut_left=FORCE_NUT_LEFT,
                 preferred_hand='auto'):
        # 保存配置参数
        self.yolo_model_path = yolo_model_path
        self.NUM_STRINGS = num_strings
        self.NUM_FRETS = num_frets
        self.YOLO_CONF = yolo_conf
        self.HAND_CONF = hand_conf
        self.STRING_EDGE_SHRINK_RATIO = string_edge_shrink_ratio
        self.DEBUG_MODE = debug_mode
        self.DRAW_FRET_NUMBERS = draw_fret_numbers
        self.USE_CLAHE = use_clahe
        self.USE_LOST_FRAME_HOLD = use_lost_frame_hold
        self.FILTER_MODE = filter_mode
        self.PRESS_THRESHOLD_PX = press_threshold_px
        self.STRING_DIST_THRESH = string_dist_thresh
        self.MIN_BOX_WIDTH = min_box_width
        self.ONE_EURO_MIN_CUTOFF = one_euro_min_cutoff  
        self.ONE_EURO_BETA = one_euro_beta
        self.ONE_EURO_DCUTOFF = one_euro_dcutoff
        self.SMOOTH_ALPHA = smooth_alpha
        self.MOTION_THRESHOLD = motion_threshold
        self.MOTION_FRAMES = motion_frames
        self.MAX_HAND_AGE_SEC = max_hand_age_sec
        self.FRET_HISTORY_LEN = fret_history_len
        self.BARRE_ANGLE_THRESH = barre_angle_thresh
        self.BARRE_MIN_COVERED = barre_min_covered
        self.USE_FIXED_DIST_THRESH = use_fixed_dist_thresh
        self.FIXED_DIST_THRESH = fixed_dist_thresh
        self.DYNAMIC_THRESH_RATIO = dynamic_thresh_ratio

        self.pinky_press_threshold_px = pinky_press_threshold_px
        self.pinky_string_dist_thresh = pinky_string_dist_thresh
        self.pinky_fret_history_len = pinky_fret_history_len
        self.pinky_smooth_alpha = pinky_smooth_alpha
        self.pinky_angle_thresh = pinky_angle_thresh
        self.pinky_prefer_low_strings = pinky_prefer_low_strings

        self.force_nut_left = force_nut_left
        self.preferred_hand = preferred_hand

        # 颜色常量
        self.COLOR_NUT = (0, 255, 0)
        self.COLOR_BRIDGE = (255, 0, 0)
        self.COLOR_FRET = (255, 255, 255)
        self.COLOR_FRET_TEXT = (0, 255, 255)
        self.COLOR_HAND = (0, 255, 0)
        self.SUMMARY_TEXT_COLOR = (255, 255, 255)
        self.SUMMARY_BG_COLOR = (0, 0, 0)
        self.STRING_COLORS = [
            (0, 0, 255), (0, 255, 0), (255, 0, 0),
            (0, 255, 255), (255, 0, 255), (255, 255, 0)
        ]
        self.FINGER_DEFS = [
            ("食指", [6, 7, 8]),
            ("中指", [10, 11, 12]),
            ("无名指", [14, 15, 16]),
            ("小指", [18, 19, 20])
        ]
        self.THUMB_LANDMARK_IDS = [0, 1, 2, 3, 4]

        # 加载YOLO模型
        logger.info("加载YOLO模型...")
        if not os.path.exists(self.yolo_model_path):
            logger.error(f"[致命错误] YOLO模型不存在！路径：{self.yolo_model_path}")
            sys.exit(1)
        self.yolo_model = YOLO(self.yolo_model_path)
        try:
            device = next(self.yolo_model.model.parameters()).device
            logger.info(f"YOLO 当前设备: {device}")
        except:
            logger.warning("无法获取 YOLO 设备信息")
        logger.info(f"YOLO 模型类别: {self.yolo_model.names}")

        # 状态变量（指板参数、滤波等）
        self.smoothed_points = {}           
        self.prev_hand_landmarks = None      
        self.last_hand_timestamp = None       
        self.one_euro_filters = {}            
        self.string_lines = []                 
        self.fret_lines = []                   
        self.global_nut_center = None          
        self.global_bridge_center = None       
        self.global_v_unit = None              
        self.global_v_len = 0                   
        self.global_perp_unit = None            
        self.global_fret_ratios = []            
        self.motion_state = {}                  
        self.motion_counter = {}                
        self.fret_history = {}                  
        self.barre_history = deque(maxlen=5)    

        self.current_frame_details = []          
        self.finger_positions = []                
        self.last_drawing_data = None

        self.string_nut_pts = np.empty((0, 2), dtype=np.float32)
        self.string_bridge_pts = np.empty((0, 2), dtype=np.float32)
        self.fret_p1s = np.empty((0, 2), dtype=np.float32)
        self.fret_p2s = np.empty((0, 2), dtype=np.float32)

        self.frame_count = 0
        self.filter_last_use = {}

        self._last_yolo_time = 0
        self.last_nut_center = None
        self.last_bridge_center = None
        self.last_nut_box = None
        self.last_bridge_box = None

        self.fretboard_lock = threading.RLock()

        # 弦号映射（原始弦号 -> 显示弦号，1=底部细弦）
        self.string_no_map = {}

    @staticmethod
    def _get_point_on_line(p1, p2, ratio):
        return np.array([p1[0] + (p2[0] - p1[0]) * ratio,
                         p1[1] + (p2[1] - p1[1]) * ratio])

    @staticmethod
    def _get_fret_position_ratio(n):
        return 1.0 - (2.0 ** (-n / 12.0))

    @staticmethod
    def _point_to_line_distance(pt, line_p1, line_p2):
        line_vec = line_p2 - line_p1
        pt_vec = pt - line_p1
        line_len = np.linalg.norm(line_vec)
        if line_len < 1e-6:
            return np.linalg.norm(pt_vec)
        cross = np.cross(line_vec, pt_vec)
        return abs(cross) / line_len

    @staticmethod
    def _point_to_line_distance_vectorized(pt, line_p1s, line_p2s):
        line_vec = line_p2s - line_p1s
        pt_vec = pt - line_p1s
        line_len = np.linalg.norm(line_vec, axis=1)
        mask = line_len > 1e-6
        dist = np.full_like(line_len, np.inf, dtype=np.float32)
        if np.any(mask):
            cross = np.abs(np.cross(line_vec[mask], pt_vec[mask]))
            dist[mask] = cross / line_len[mask]
        return dist

    def _get_fret_from_point(self, pt):
        if self.global_nut_center is None or self.global_v_unit is None or self.global_v_len == 0:
            return 1
        w_vec = pt - self.global_nut_center
        t = np.dot(w_vec, self.global_v_unit) / self.global_v_len
        t = np.clip(t, 0, 1)
        idx = np.searchsorted(self.global_fret_ratios, t, side='right')
        return min(idx, self.NUM_FRETS)

    def _cleanup_old_filters(self, current_time):
        expired = [k for k, t in self.filter_last_use.items() if current_time - t > 5.0]
        for k in expired:
            self.one_euro_filters.pop(k, None)
            self.motion_state.pop(f"motion_{k}", None)
            self.motion_counter.pop(f"motion_{k}", None)
            self.smoothed_points.pop(k, None)
            self.filter_last_use.pop(k, None)
            logger.debug(f"清理过期滤波状态: {k}")

    # ---------- 指板参数更新（由缩略图触发） ----------
    def update_fretboard(self, frame):
        """接收一帧图像，运行YOLO检测琴枕和琴桥，限频300ms以平衡实时性与性能"""
        now = time.time()
        if (self.last_nut_center is not None and self.last_bridge_center is not None
                and now - self._last_yolo_time < 0.3):
            return True

        with self.fretboard_lock:
            # 二次检查，避免锁等待期间其他线程已更新
            if self.last_nut_center is not None and now - self._last_yolo_time < 0.3:
                return True
            self._last_yolo_time = now
            h_img, w_img = frame.shape[:2]
            t0 = time.time()
            results = self.yolo_model(frame, conf=self.YOLO_CONF, verbose=False)
            t1 = time.time()
            logger.info(f"YOLO 推理耗时: {(t1 - t0) * 1000:.1f} ms")

            nut_center = None
            bridge_center = None
            nut_box = None
            bridge_box = None

            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                    conf = float(box.conf[0])
                    if cls_id == 0:
                        nut_center = np.array([cx, cy])
                        nut_box = (x1, y1, x2, y2)
                        logger.info(f"YOLO 琴枕: 中心({cx:.1f},{cy:.1f}), 宽度{x2-x1:.1f}, 置信度{conf:.2f}")
                    elif cls_id == 1:
                        bridge_center = np.array([cx, cy])
                        bridge_box = (x1, y1, x2, y2)
                        logger.info(f"YOLO 琴桥: 中心({cx:.1f},{cy:.1f}), 宽度{x2-x1:.1f}, 置信度{conf:.2f}")

            if nut_center is None or bridge_center is None:
                logger.warning("update_fretboard: 未同时检测到琴枕和琴桥")
                return False

            nut_height = nut_box[3] - nut_box[1]
            bridge_height = bridge_box[3] - bridge_box[1]
            if nut_height <= self.MIN_BOX_WIDTH or bridge_height <= self.MIN_BOX_WIDTH:
                logger.warning(f"update_fretboard: 检测框高度过小，跳过")
                return False

            if self.force_nut_left and nut_center[0] > bridge_center[0]:
                nut_center, bridge_center = bridge_center, nut_center
                nut_box, bridge_box = bridge_box, nut_box

            self.last_nut_center = nut_center
            self.last_bridge_center = bridge_center
            self.last_nut_box = nut_box
            self.last_bridge_box = bridge_box

            # 计算指板几何参数
            line_vec = bridge_center - nut_center
            perp_vec = np.array([-line_vec[1], line_vec[0]])
            perp_len = np.linalg.norm(perp_vec)
            if perp_len > 0:
                perp_unit = perp_vec / perp_len
            else:
                perp_unit = np.array([0, 0])

            v_len = np.linalg.norm(line_vec)
            if v_len > 0:
                v_unit = line_vec / v_len
            else:
                v_unit = np.array([1, 0])

            self.global_nut_center = nut_center
            self.global_bridge_center = bridge_center
            self.global_v_unit = v_unit
            self.global_v_len = v_len
            self.global_perp_unit = perp_unit

            nut_h = nut_box[3] - nut_box[1]
            bridge_h = bridge_box[3] - bridge_box[1]

            nut_top = nut_center + perp_unit * (nut_h / 2)
            nut_bottom = nut_center - perp_unit * (nut_h / 2)
            bridge_top = bridge_center + perp_unit * (bridge_h / 2)
            bridge_bottom = bridge_center - perp_unit * (bridge_h / 2)

            # 生成品丝线
            self.fret_lines = []
            for n in range(1, self.NUM_FRETS + 1):
                fret_ratio = self._get_fret_position_ratio(n)
                if 0 <= fret_ratio <= 1:
                    fret_center = self._get_point_on_line(nut_center, bridge_center, fret_ratio)
                    fret_p1 = fret_center + perp_unit * (max(nut_h, bridge_h) * 0.85 / 2)
                    fret_p2 = fret_center - perp_unit * (max(nut_h, bridge_h) * 0.85 / 2)
                    self.fret_lines.append((n, fret_p1, fret_p2, fret_center))

            self.fret_p1s = np.array([p1 for _, p1, _, _ in self.fret_lines], dtype=np.float32)
            self.fret_p2s = np.array([p2 for _, _, p2, _ in self.fret_lines], dtype=np.float32)

            # 生成琴弦线
            self.string_lines = []
            shrink_nut_top = self._get_point_on_line(nut_top, nut_bottom, self.STRING_EDGE_SHRINK_RATIO)
            shrink_nut_bottom = self._get_point_on_line(nut_bottom, nut_top, self.STRING_EDGE_SHRINK_RATIO)
            shrink_bridge_top = self._get_point_on_line(bridge_top, bridge_bottom, self.STRING_EDGE_SHRINK_RATIO)
            shrink_bridge_bottom = self._get_point_on_line(bridge_bottom, bridge_top, self.STRING_EDGE_SHRINK_RATIO)

            for i in range(self.NUM_STRINGS):
                t = i / (self.NUM_STRINGS - 1) if self.NUM_STRINGS > 1 else 0.5
                string_nut = self._get_point_on_line(shrink_nut_top, shrink_nut_bottom, t)
                string_bridge = self._get_point_on_line(shrink_bridge_top, shrink_bridge_bottom, t)
                self.string_lines.append((i+1, string_nut, string_bridge))

            self.string_nut_pts = np.array([p_nut for _, p_nut, _ in self.string_lines], dtype=np.float32)
            self.string_bridge_pts = np.array([p_bridge for _, _, p_bridge in self.string_lines], dtype=np.float32)

            # 品丝比例
            fret_ratios = [0.0] * (self.NUM_FRETS + 1)
            for n in range(1, self.NUM_FRETS + 1):
                fret_ratios[n] = self._get_fret_position_ratio(n)
            self.global_fret_ratios = fret_ratios

            # 建立弦号映射（根据琴弦线的垂直位置）
            if self.string_lines:
                mid_y = [(p_nut[1] + p_bridge[1]) / 2 for _, p_nut, p_bridge in self.string_lines]
                sorted_indices = np.argsort(mid_y)[::-1]
                self.string_no_map = {}
                for new_no, orig_idx in enumerate(sorted_indices, start=1):
                    orig_no = self.string_lines[orig_idx][0]
                    self.string_no_map[orig_no] = new_no
                logger.info(f"弦号映射建立: {self.string_no_map}")
            else:
                self.string_no_map = {}

            logger.info("指板参数更新完成")
            return True

    # ---------- 核心：接收前端关键点进行按弦判定 ----------
    def process_landmarks(self, hand_landmarks, timestamp, img_width, img_height):
        """
        接收前端传入的21个手部关键点（归一化坐标），结合当前缓存的指板参数进行按弦判定
        hand_landmarks: list of [x, y] 归一化坐标（0~1）
        timestamp: 时间戳（毫秒）
        img_width, img_height: 原始图像尺寸，用于坐标换算
        """
        result = {
            'status': 'success',
            'positions': [],
            'barre': None,
            'drawing_data': None
        }

        with self.fretboard_lock:
            if (self.global_nut_center is None or self.global_bridge_center is None or
                    len(self.string_lines) == 0 or len(self.fret_lines) == 0 or
                    self.global_v_unit is None):
                logger.warning("指板参数未就绪，但仍返回手部关键点用于调试")
                raw_landmarks_px = [[int(lm[0] * img_width), int(lm[1] * img_height)] for lm in hand_landmarks]
                drawing_data = self._build_drawing_data(img_width, img_height, raw_landmarks_px, [])
                result['drawing_data'] = drawing_data
                return result

            # 坐标转换
            landmarks_px = []
            for lm in hand_landmarks:
                x = int(lm[0] * img_width)
                y = int(lm[1] * img_height)
                landmarks_px.append((x, y))

            thumb_w = THUMBNAIL_WIDTH
            thumb_h = int(thumb_w * img_height / img_width)
            scale_x = thumb_w / img_width
            scale_y = thumb_h / img_height
            scale = scale_x  # 假设等比例

            landmarks_thumb = []
            for (x, y) in landmarks_px:
                x_thumb = x * scale_x
                y_thumb = y * scale_y
                landmarks_thumb.append((x_thumb, y_thumb))
            landmarks_thumb_np = [np.array(pt) for pt in landmarks_thumb]

            # 横按检测
            barre_chord = False
            barre_start = None
            barre_end = None
            barre_fret = None
            index_points_for_barre_thumb = [landmarks_thumb_np[i] for i in [5, 6, 7, 8]]
            index_points_for_barre_px = [landmarks_px[i] for i in [5, 6, 7, 8]]

            if len(index_points_for_barre_thumb) >= 2:
                pts = np.array(index_points_for_barre_thumb)
                vx, vy, x0, y0 = cv2.fitLine(pts, cv2.DIST_L2, 0, 0.01, 0.01)
                line_dir = np.array([vx[0], vy[0]])
                line_pt = np.array([x0[0], y0[0]])

                cos_angle = abs(np.dot(line_dir, self.global_perp_unit))
                angle_deg = np.degrees(np.arccos(np.clip(cos_angle, 0, 1)))
                if angle_deg <= self.BARRE_ANGLE_THRESH:
                    proj = np.dot(pts - line_pt, self.global_perp_unit)
                    proj_min, proj_max = np.min(proj), np.max(proj)

                    string_projs = []
                    for i, (p_nut, p_bridge) in enumerate(zip(self.string_nut_pts, self.string_bridge_pts)):
                        mid = (p_nut + p_bridge) / 2
                        proj_val = np.dot(mid - line_pt, self.global_perp_unit)
                        string_projs.append((i + 1, proj_val))

                    covered_strings = [s for s, val in string_projs if proj_min <= val <= proj_max]
                    if len(covered_strings) >= self.BARRE_MIN_COVERED:
                        sorted_str = sorted(covered_strings)
                        longest_start = sorted_str[0]
                        longest_end = sorted_str[0]
                        current_start = sorted_str[0]
                        current_end = sorted_str[0]
                        for s in sorted_str[1:]:
                            if s == current_end + 1:
                                current_end = s
                            else:
                                if current_end - current_start + 1 > longest_end - longest_start + 1:
                                    longest_start, longest_end = current_start, current_end
                                current_start = current_end = s
                        if current_end - current_start + 1 > longest_end - longest_start + 1:
                            longest_start, longest_end = current_start, current_end

                        if longest_end - longest_start + 1 >= self.BARRE_MIN_COVERED:
                            barre_start = longest_start
                            barre_end = longest_end
                            tip_idx = 8
                            tip_pt_thumb = landmarks_thumb_np[tip_idx]
                            barre_fret = self._get_fret_from_point(tip_pt_thumb)
                            barre_chord = True
                            logger.info(f"横按: 弦{barre_start}-{barre_end} 品{barre_fret}")

            # 手指按弦判定
            finger_details = []
            for finger_name, indices in self.FINGER_DEFS:
                if finger_name == "食指" and barre_chord:
                    continue

                tip_idx = indices[-1]
                tip_pt_thumb = landmarks_thumb_np[tip_idx]
                tip_px = landmarks_px[tip_idx]

                is_pinky = (finger_name == "小指")
                if is_pinky:
                    p18 = landmarks_thumb_np[18]
                    p19 = landmarks_thumb_np[19]
                    p20 = landmarks_thumb_np[20]
                    v1 = p19 - p18
                    v2 = p20 - p19
                    norm1 = np.linalg.norm(v1)
                    norm2 = np.linalg.norm(v2)
                    if norm1 > 0 and norm2 > 0:
                        cos_angle = np.dot(v1, v2) / (norm1 * norm2)
                        angle = np.degrees(np.arccos(np.clip(cos_angle, -1, 1)))
                        if angle < self.pinky_angle_thresh:
                            continue
                    else:
                        continue

                press_thresh_orig = self.pinky_press_threshold_px if is_pinky else self.PRESS_THRESHOLD_PX
                string_thresh_orig = self.pinky_string_dist_thresh if is_pinky else self.STRING_DIST_THRESH
                press_thresh = press_thresh_orig * scale
                string_thresh = string_thresh_orig * scale
                history_len = self.pinky_fret_history_len if is_pinky else self.FRET_HISTORY_LEN

                if len(self.fret_p1s) > 0:
                    dists_to_frets = self._point_to_line_distance_vectorized(tip_pt_thumb, self.fret_p1s, self.fret_p2s)
                    min_fret_dist = np.min(dists_to_frets)
                else:
                    min_fret_dist = float('inf')
                if min_fret_dist > press_thresh:
                    continue

                if len(self.string_nut_pts) > 0:
                    dists_to_strings = self._point_to_line_distance_vectorized(tip_pt_thumb, self.string_nut_pts, self.string_bridge_pts)
                    min_idx = np.argmin(dists_to_strings)
                    min_string_dist = dists_to_strings[min_idx]
                    closest_string_no = min_idx + 1
                    if self.string_no_map:
                        new_string_no = self.string_no_map.get(closest_string_no, closest_string_no)
                    else:
                        new_string_no = closest_string_no
                else:
                    continue

                candidate_fret = self._get_fret_from_point(tip_pt_thumb)
                if finger_name not in self.fret_history:
                    self.fret_history[finger_name] = deque(maxlen=history_len)
                self.fret_history[finger_name].append(candidate_fret)
                counter = Counter(self.fret_history[finger_name])
                final_fret = counter.most_common(1)[0][0]

                detail = {
                    'finger': finger_name,
                    'string_start': int(new_string_no),
                    'string_end': int(new_string_no),
                    'fret': int(final_fret),
                    'tip_x': int(tip_px[0]),
                    'tip_y': int(tip_px[1]),
                    'is_barre': False,
                    'index_points': None
                }
                finger_details.append(detail)

            if barre_chord:
                if self.string_no_map:
                    barre_start = self.string_no_map.get(barre_start, barre_start)
                    barre_end = self.string_no_map.get(barre_end, barre_end)
                finger_details.append({
                    'finger': '食指',
                    'string_start': int(barre_start),
                    'string_end': int(barre_end),
                    'fret': int(barre_fret),
                    'tip_x': None,
                    'tip_y': None,
                    'is_barre': True,
                    'index_points': [[float(pt[0]), float(pt[1])] for pt in index_points_for_barre_px]
                })

            result['positions'] = [{'string': d['string_start'], 'fret': d['fret']} for d in finger_details if not d['is_barre']]
            if barre_chord:
                result['barre'] = {
                    'fret': int(barre_fret),
                    'startString': int(barre_start),
                    'endString': int(barre_end)
                }

            raw_landmarks_px = [[x, y] for (x, y) in landmarks_px]
            result['drawing_data'] = self._build_drawing_data(
                img_width, img_height, raw_landmarks_px, finger_details
            )
            return result

    # ---------- 完整图像处理（传统模式，不再使用MediaPipe，仅返回空手部） ----------
    def process_frame(self, frame, timestamp=None):
        """
        处理完整图像帧（传统模式）。由于后端不再运行MediaPipe，此方法仅更新指板参数，
        并返回空的手部检测结果。
        """
        h_img, w_img = frame.shape[:2]
        update_success = self.update_fretboard(frame)
        if update_success:
            logger.info("传统模式：指板参数更新成功")

        result = {
            'status': 'success',
            'positions': [],
            'barre': None,
            'drawing_data': self._build_drawing_data(w_img, h_img, [])
        }
        return frame, result

    # ---------- 构建绘图数据 ----------
    def _build_drawing_data(self, w_img, h_img, hand_landmarks_px, finger_details=None):
        """构建前端绘图数据，将缩略图坐标转换为原始图像坐标"""
        drawing_data = {}
        drawing_data['image_size'] = [int(w_img), int(h_img)]

        thumb_w = THUMBNAIL_WIDTH
        thumb_h = int(thumb_w * h_img / w_img)

        strings_data = []
        for s, p_nut, p_bridge in self.string_lines:
            x_nut = p_nut[0] * (w_img / thumb_w)
            y_nut = p_nut[1] * (h_img / thumb_h)
            x_bridge = p_bridge[0] * (w_img / thumb_w)
            y_bridge = p_bridge[1] * (h_img / thumb_h)
            strings_data.append({
                'string': int(s),
                'start': [float(x_nut), float(y_nut)],
                'end': [float(x_bridge), float(y_bridge)]
            })
        drawing_data['strings'] = strings_data

        frets_data = []
        for n, p1, p2, center in self.fret_lines:
            x_p1 = p1[0] * (w_img / thumb_w)
            y_p1 = p1[1] * (h_img / thumb_h)
            x_p2 = p2[0] * (w_img / thumb_w)
            y_p2 = p2[1] * (h_img / thumb_h)
            x_center = center[0] * (w_img / thumb_w)
            y_center = center[1] * (h_img / thumb_h)
            frets_data.append({
                'fret': int(n),
                'start': [float(x_p1), float(y_p1)],
                'end': [float(x_p2), float(y_p2)],
                'center': [float(x_center), float(y_center)]
            })
        drawing_data['frets'] = frets_data

        drawing_data['hand_landmarks'] = hand_landmarks_px if hand_landmarks_px else []

        press_points = []
        if finger_details:
            for d in finger_details:
                new_d = {
                    'finger': d['finger'],
                    'string_start': int(d['string_start']),
                    'string_end': int(d['string_end']),
                    'fret': int(d['fret']),
                    'is_barre': bool(d['is_barre']),
                    'tip_x': int(d['tip_x']) if d.get('tip_x') is not None else None,
                    'tip_y': int(d['tip_y']) if d.get('tip_y') is not None else None,
                    'index_points': None
                }
                if d.get('index_points') is not None:
                    new_d['index_points'] = [[float(pt[0]), float(pt[1])] for pt in d['index_points']]
                press_points.append(new_d)
        drawing_data['press_points'] = press_points

        if self.global_nut_center is not None:
            x_nut = self.global_nut_center[0] * (w_img / thumb_w)
            y_nut = self.global_nut_center[1] * (h_img / thumb_h)
            drawing_data['nut_center'] = [float(x_nut), float(y_nut)]
        else:
            drawing_data['nut_center'] = None

        if self.global_bridge_center is not None:
            x_bridge = self.global_bridge_center[0] * (w_img / thumb_w)
            y_bridge = self.global_bridge_center[1] * (h_img / thumb_h)
            drawing_data['bridge_center'] = [float(x_bridge), float(y_bridge)]
        else:
            drawing_data['bridge_center'] = None

        return drawing_data

    def get_current_frame_details(self):
        return self.current_frame_details

    def get_last_result(self):
        return self.finger_positions

    def get_drawing_data(self):
        return self.last_drawing_data

    def close(self):
        """释放资源（无MediaPipe，仅释放YOLO模型）"""
        del self.yolo_model
        cv2.destroyAllWindows()
        logger.info("识别器资源已释放")

    def get_fretboard_params(self):
        """返回前端按弦判定所需的指板几何参数"""
        with self.fretboard_lock:
            if self.global_nut_center is None or self.global_bridge_center is None:
                return None
            
            # 构建琴弦数据
            strings = []
            for s, p_nut, p_bridge in self.string_lines:
                strings.append({
                    'string': int(s),
                    'nut': [float(p_nut[0]), float(p_nut[1])],
                    'bridge': [float(p_bridge[0]), float(p_bridge[1])]
                })
            
            # 构建品丝数据
            frets = []
            for n, p1, p2, center in self.fret_lines:
                frets.append({
                    'fret': int(n),
                    'p1': [float(p1[0]), float(p1[1])],
                    'p2': [float(p2[0]), float(p2[1])]
                })
            
            return {
                'nut_center': [float(self.global_nut_center[0]), float(self.global_nut_center[1])],
                'bridge_center': [float(self.global_bridge_center[0]), float(self.global_bridge_center[1])],
                'v_unit': [float(self.global_v_unit[0]), float(self.global_v_unit[1])],
                'v_len': float(self.global_v_len),
                'perp_unit': [float(self.global_perp_unit[0]), float(self.global_perp_unit[1])],
                'strings': strings,
                'frets': frets,
                'num_strings': self.NUM_STRINGS,
                'num_frets': self.NUM_FRETS,
                'string_no_map': {str(k): int(v) for k, v in self.string_no_map.items()}
            }