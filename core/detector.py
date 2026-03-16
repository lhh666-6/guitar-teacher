import cv2
import numpy as np
from ultralytics import YOLO
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode
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
    吉他指法识别器（优化版）
    支持两种模式：
      1. 传统模式：传入完整图像，同时运行 YOLO+MediaPipe（process_frame）
      2. 混合模式：通过 update_fretboard 更新指板参数，然后通过 process_landmarks 传入关键点进行按弦判定
    """
    def __init__(self,
                 yolo_model_path=YOLO_MODEL_PATH,
                 hand_model_path=HAND_MODEL_PATH,
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
        self.hand_model_path = hand_model_path
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

        # 颜色常量（不变）
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

        self._check_hand_model()

        # 加载YOLO
        logger.info("加载YOLO模型...")
        if not os.path.exists(self.yolo_model_path):
            logger.error(f"[致命错误] YOLO模型不存在！路径：{self.yolo_model_path}")
            sys.exit(1)
        self.yolo_model = YOLO(self.yolo_model_path)
        try:
            self.yolo_model.to('cuda')
            logger.info("YOLO 模型已移动到 GPU")
        except Exception as e:
            logger.warning(f"YOLO 模型移动到 GPU 失败，使用 CPU: {e}")
        try:
            device = next(self.yolo_model.model.parameters()).device
            logger.info(f"YOLO 当前设备: {device}")
        except:
            logger.warning("无法获取 YOLO 设备信息")
        logger.info(f"YOLO 模型类别: {self.yolo_model.names}")

        # 加载MediaPipe（保留，但混合模式下不使用）
        logger.info("加载MediaPipe手部模型（CPU模式）...")
        hand_options = HandLandmarkerOptions(
            base_options=python.BaseOptions(
                model_asset_path=self.hand_model_path,
                delegate=python.BaseOptions.Delegate.CPU
            ),
            running_mode=RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=self.HAND_CONF,
            min_hand_presence_confidence=self.HAND_CONF,
            min_tracking_confidence=self.HAND_CONF
        )
        self.hand_detector = HandLandmarker.create_from_options(hand_options)
        logger.info("MediaPipe 手部检测器初始化完成")

        # 状态变量
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

        self.last_nut_center = None
        self.last_bridge_center = None
        self.last_nut_box = None
        self.last_bridge_box = None

        # 新增：用于指板参数的线程锁
        self.fretboard_lock = threading.RLock()

    def _check_hand_model(self):
        if not os.path.exists(self.hand_model_path):
            logger.error("\n[错误] 找不到 hand_landmarker.task 模型文件")
            logger.error("下载地址：https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task")
            sys.exit(1)

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

    # ---------- 新增方法1：从缩略图更新指板参数 ----------
    def update_fretboard(self, frame):
        """接收一帧图像，运行YOLO检测琴枕和琴桥，更新指板几何参数"""
        with self.fretboard_lock:
            h_img, w_img = frame.shape[:2]
            results = self.yolo_model(frame, conf=self.YOLO_CONF, verbose=False)

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
                        logger.info(f"YOLO 琴枕: 中心({cx:.1f},{cy:.1f}), 宽度{x2-x1:.1f}, 置信度{conf:.2f}")

            if nut_center is None or bridge_center is None:
                logger.warning("update_fretboard: 未同时检测到琴枕和琴桥")
                return False

            # 检查高度（琴颈宽度）
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

            logger.info("指板参数更新完成")
            # 在 return True 之前添加
            debug_img = frame.copy()
            # 绘制琴枕框
            cv2.rectangle(debug_img, (int(x1), int(y1)), (int(x2), int(y2)), (0,255,0), 2)
            # 绘制琴桥框
            cv2.rectangle(debug_img, (int(x1), int(y1)), (int(x2), int(y2)), (255,0,0), 2)
            # 绘制琴弦线
            for i, (s, p_nut, p_bridge) in enumerate(self.string_lines):
                cv2.line(debug_img, (int(p_nut[0]), int(p_nut[1])), (int(p_bridge[0]), int(p_bridge[1])), (0,255,255), 1)
            cv2.imwrite("fretboard_debug.jpg", debug_img)
            return True

    def process_landmarks(self, hand_landmarks, timestamp, img_width, img_height):
        """
        接收前端传入的21个手部关键点（归一化坐标），结合当前缓存的指板参数进行按弦判定
        hand_landmarks: list of [x, y] 归一化坐标（0~1）
        timestamp: 时间戳（毫秒）
        img_width, img_height: 原始图像尺寸，用于坐标换算
        """
        # 准备结果结构
        result = {
            'status': 'success',
            'positions': [],
            'barre': None,
            'drawing_data': None  # 稍后填充
        }

        with self.fretboard_lock:
            # 检查指板参数是否已就绪
            if (self.global_nut_center is None or self.global_bridge_center is None or
                    len(self.string_lines) == 0 or len(self.fret_lines) == 0 or
                    self.global_v_unit is None):
                logger.warning("指板参数未就绪，但仍返回手部关键点用于调试")
                # 将归一化坐标转换为像素坐标
                raw_landmarks_px = [[int(lm[0] * img_width), int(lm[1] * img_height)] for lm in hand_landmarks]
                # 构建仅包含手部关键点的 drawing_data（无按弦点）
                drawing_data = self._build_drawing_data(img_width, img_height, raw_landmarks_px, [])
                result['drawing_data'] = drawing_data
                return result

            # ---------- 坐标转换 ----------
            # 1. 将归一化坐标转换为原始图像像素坐标（用于返回绘制）
            landmarks_px = []
            for lm in hand_landmarks:
                x = int(lm[0] * img_width)
                y = int(lm[1] * img_height)
                landmarks_px.append((x, y))

            # 2. 计算缩略图尺寸（与前端 sendThumbnail 一致）
            thumb_w = THUMBNAIL_WIDTH
            thumb_h = int(thumb_w * img_height / img_width)

            # 3. 将原始像素坐标转换为缩略图坐标（用于几何判定）
            scale_x = thumb_w / img_width
            scale_y = thumb_h / img_height
            # 假设缩放各向同性，取宽度比例作为统一缩放因子（因为图像保持宽高比，两者接近）
            scale = scale_x

            landmarks_thumb = []
            for (x, y) in landmarks_px:
                x_thumb = x * scale_x
                y_thumb = y * scale_y
                landmarks_thumb.append((x_thumb, y_thumb))

            # 转换为 numpy 数组方便计算
            landmarks_thumb_np = [np.array(pt) for pt in landmarks_thumb]

            # ---------- 横按检测（使用缩略图坐标）----------
            barre_chord = False
            barre_start = None
            barre_end = None
            barre_fret = None
            index_points_for_barre_thumb = [landmarks_thumb_np[i] for i in [5, 6, 7, 8]]
            index_points_for_barre_px = [landmarks_px[i] for i in [5, 6, 7, 8]]  # 用于返回绘制

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
                        # 找最长连续段
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
                            tip_idx = 8  # 食指尖
                            tip_pt_thumb = landmarks_thumb_np[tip_idx]
                            barre_fret = self._get_fret_from_point(tip_pt_thumb)  # 使用缩略图坐标
                            barre_chord = True
                            logger.info(f"横按: 弦{barre_start}-{barre_end} 品{barre_fret}")

            # ---------- 手指按弦判定（使用缩略图坐标）----------
            finger_details = []
            for finger_name, indices in self.FINGER_DEFS:
                if finger_name == "食指" and barre_chord:
                    continue

                tip_idx = indices[-1]
                tip_pt_thumb = landmarks_thumb_np[tip_idx]
                tip_px = landmarks_px[tip_idx]  # 用于返回绘制

                is_pinky = (finger_name == "小指")

                # 小指弯曲角度检查（使用缩略图坐标）
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

                # 阈值转换：原始阈值是在原始图像尺寸下定义的，需要缩放到缩略图尺寸
                press_thresh_orig = self.pinky_press_threshold_px if is_pinky else self.PRESS_THRESHOLD_PX
                string_thresh_orig = self.pinky_string_dist_thresh if is_pinky else self.STRING_DIST_THRESH
                press_thresh = press_thresh_orig * scale
                string_thresh = string_thresh_orig * scale
                history_len = self.pinky_fret_history_len if is_pinky else self.FRET_HISTORY_LEN

                # 品丝距离检查（使用缩略图坐标）
                if len(self.fret_p1s) > 0:
                    dists_to_frets = self._point_to_line_distance_vectorized(tip_pt_thumb, self.fret_p1s, self.fret_p2s)
                    min_fret_dist = np.min(dists_to_frets)
                else:
                    min_fret_dist = float('inf')
                if min_fret_dist > press_thresh:
                    continue

                # 琴弦距离检查（使用缩略图坐标）
                if len(self.string_nut_pts) > 0:
                    dists_to_strings = self._point_to_line_distance_vectorized(tip_pt_thumb, self.string_nut_pts, self.string_bridge_pts)
                    min_idx = np.argmin(dists_to_strings)
                    min_string_dist = dists_to_strings[min_idx]
                    closest_string_no = min_idx + 1
                else:
                    min_string_dist = float('inf')
                    closest_string_no = None
                if min_string_dist > string_thresh:
                    continue

                # 品号历史平滑（品号逻辑值，与坐标系无关）
                candidate_fret = self._get_fret_from_point(tip_pt_thumb)
                if finger_name not in self.fret_history:
                    self.fret_history[finger_name] = deque(maxlen=history_len)
                self.fret_history[finger_name].append(candidate_fret)
                counter = Counter(self.fret_history[finger_name])
                final_fret = counter.most_common(1)[0][0]

                detail = {
                    'finger': finger_name,
                    'string_start': int(closest_string_no),
                    'string_end': int(closest_string_no),
                    'fret': int(final_fret),
                    'tip_x': int(tip_px[0]),      # 使用原始像素坐标
                    'tip_y': int(tip_px[1]),
                    'is_barre': False,
                    'index_points': None
                }
                finger_details.append(detail)

            if barre_chord:
                finger_details.append({
                    'finger': '食指',
                    'string_start': int(barre_start),
                    'string_end': int(barre_end),
                    'fret': int(barre_fret),
                    'tip_x': None,
                    'tip_y': None,
                    'is_barre': True,
                    'index_points': [[float(pt[0]), float(pt[1])] for pt in index_points_for_barre_px]  # 原始坐标
                })

            # 构建返回结果
            result['positions'] = [{'string': d['string_start'], 'fret': d['fret']} for d in finger_details if not d['is_barre']]
            if barre_chord:
                result['barre'] = {
                    'fret': int(barre_fret),
                    'startString': int(barre_start),
                    'endString': int(barre_end)
                }

            # 准备原始像素坐标列表（用于前端绘制，不经过任何变换）
            raw_landmarks_px = [[x, y] for (x, y) in landmarks_px]

            # 调用绘制函数，传入原始像素坐标
            result['drawing_data'] = self._build_drawing_data(
                img_width, img_height, raw_landmarks_px, finger_details
            )
            logger.info(f"drawing_data keys before return: {result['drawing_data'].keys()}")
            return result  
            

    def process_frame(self, frame, timestamp=None):
        """处理完整图像帧（同时运行YOLO和MediaPipe）"""
        with self.fretboard_lock:   # 加锁以保证与 update_fretboard 的共享变量安全
            t_start = time.perf_counter()
            timings = {}
  
            h_img, w_img = frame.shape[:2]
            self.frame_count += 1
            if timestamp is not None and self.frame_count % 100 == 0:
                self._cleanup_old_filters(timestamp)

            # 图像增强（可选）
            if self.USE_CLAHE:
                lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
                l, a, b = cv2.split(lab)
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))  
                l = clahe.apply(l)
                enhanced_lab = cv2.merge((l,a,b))
                enhanced_frame = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
            else:
                enhanced_frame = frame.copy()

            # YOLO检测
            t_yolo = time.perf_counter()
            results = self.yolo_model(frame, conf=self.YOLO_CONF, verbose=False)
            timings['yolo'] = (time.perf_counter() - t_yolo) * 1000

            nut_center = None
            bridge_center = None
            nut_box = None
            bridge_box = None
            fretboard_detected = False

            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    cx, cy = (x1+x2)/2, (y1+y2)/2
                    if cls_id == 0:
                        nut_center = np.array([cx, cy])
                        nut_box = (x1, y1, x2, y2)
                    elif cls_id == 1:
                        bridge_center = np.array([cx, cy])
                        bridge_box = (x1, y1, x2, y2)

            if nut_center is not None and bridge_center is not None:
                nut_height = nut_box[3] - nut_box[1]
                bridge_height = bridge_box[3] - bridge_box[1]
                if nut_height > self.MIN_BOX_WIDTH and bridge_height > self.MIN_BOX_WIDTH:
                    if self.force_nut_left and nut_center[0] > bridge_center[0]:
                        nut_center, bridge_center = bridge_center, nut_center
                        nut_box, bridge_box = bridge_box, nut_box

                    self.last_nut_center = nut_center
                    self.last_bridge_center = bridge_center
                    self.last_nut_box = nut_box
                    self.last_bridge_box = bridge_box

                    # 更新指板几何参数（复用 update_fretboard 中的计算，但为避免重复代码，可直接调用内部函数）
                    # 为简洁，这里重新计算
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

                    # 品丝线
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

                    # 琴弦线
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

                    fret_ratios = [0.0] * (self.NUM_FRETS + 1)
                    for n in range(1, self.NUM_FRETS + 1):
                        fret_ratios[n] = self._get_fret_position_ratio(n)
                    self.global_fret_ratios = fret_ratios

                    fretboard_detected = True
                    logger.info("传统模式：指板参数更新成功")
                else:
                    logger.warning("传统模式：检测框高度过小")
            else:
                logger.warning("传统模式：未检测到琴枕/琴桥")

            # 手部检测
            t_hand = time.perf_counter()
            rgb_frame = cv2.cvtColor(enhanced_frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            if timestamp is None:
                ms_timestamp = 0
            else:
                ms_timestamp = int(timestamp * 1000)
            detection_result = self.hand_detector.detect_for_video(mp_image, ms_timestamp)
            timings['hand_detect'] = (time.perf_counter() - t_hand) * 1000

            hand_landmarks_to_use = None
            hand_found = False

            if detection_result.hand_landmarks:
                # 根据偏好选择手
                if self.preferred_hand in ['left', 'right']:
                    target_hand = 'Left' if self.preferred_hand == 'left' else 'Right'
                    for i, handedness in enumerate(detection_result.handedness):
                        if handedness[0].category_name == target_hand:
                            hand_landmarks_to_use = detection_result.hand_landmarks[i]
                            hand_found = True
                            break
                else:  # auto
                    if self.global_nut_center is not None:
                        min_dist = float('inf')
                        for i, hand_landmarks in enumerate(detection_result.hand_landmarks):
                            avg_x = sum(lm.x for lm in hand_landmarks) / len(hand_landmarks)
                            avg_y = sum(lm.y for lm in hand_landmarks) / len(hand_landmarks)
                            hand_pos = np.array([avg_x * w_img, avg_y * w_img])
                            dist = np.linalg.norm(hand_pos - self.global_nut_center)
                            if dist < min_dist:
                                min_dist = dist
                                hand_landmarks_to_use = hand_landmarks
                                hand_found = True
                    else:
                        # 回退：选择左半屏最左侧的手
                        left_hand_candidates = []
                        for hand_landmarks in detection_result.hand_landmarks:
                            avg_x = sum(lm.x for lm in hand_landmarks) / len(hand_landmarks)
                            if avg_x * w_img < w_img / 2:
                                left_hand_candidates.append(hand_landmarks)
                        if left_hand_candidates:
                            leftmost_idx = min(range(len(left_hand_candidates)),
                                               key=lambda i: sum(lm.x for lm in left_hand_candidates[i]) / len(left_hand_candidates[i]))
                            hand_landmarks_to_use = left_hand_candidates[leftmost_idx]
                            hand_found = True

                if hand_found:
                    self.prev_hand_landmarks = hand_landmarks_to_use
                    self.last_hand_timestamp = timestamp

            if not hand_found or hand_landmarks_to_use is None:
                result = {
                    'status': 'success',
                    'positions': [],
                    'barre': None,
                    'drawing_data': self._build_drawing_data(w_img, h_img, [])
                }
                return frame, result

            # 将 MediaPipe 关键点转换为前端兼容格式（归一化列表）
            hand_landmarks_norm = [[lm.x, lm.y] for lm in hand_landmarks_to_use]

            # 复用 process_landmarks 进行按弦判定（避免重复代码）
            # 注意：process_landmarks 内部需要访问指板参数，我们已经更新过了
            result = self.process_landmarks(hand_landmarks_norm, timestamp, w_img, h_img)

            total_ms = (time.perf_counter() - t_start) * 1000
            logger.info(
                f"[DETAIL] YOLO={timings.get('yolo',0):.1f}ms, Hand={timings.get('hand_detect',0):.1f}ms, "
                f"Total={total_ms:.1f}ms | 按点: {len(result['positions'])}"
            )
            return frame, result

    # ---------- 构建绘图数据 ----------
    def _build_drawing_data(self, w_img, h_img, hand_landmarks_px, finger_details=None):
        """构建前端绘图数据，将缩略图坐标转换为原始图像坐标"""
        drawing_data = {}
        drawing_data['image_size'] = [int(w_img), int(h_img)]

        # 计算缩略图实际高度（与前端 sendThumbnail 中的计算一致）
        thumb_w = THUMBNAIL_WIDTH
        thumb_h = int(thumb_w * h_img / w_img)

        # ---------- 琴弦线（转换坐标） ----------
        strings_data = []
        for s, p_nut, p_bridge in self.string_lines:
            # p_nut/p_bridge 是缩略图坐标系下的坐标，转换到原始图像坐标
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

        # ---------- 品丝线（转换坐标） ----------
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

        # ---------- 手部关键点（已是原始坐标，无需转换） ----------
        drawing_data['hand_landmarks'] = hand_landmarks_px if hand_landmarks_px else []

        # ---------- 按弦点（tip_x/tip_y 已是原始坐标，无需转换） ----------
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
                    # 横按的食指关键点也是原始坐标，无需转换
                    new_d['index_points'] = [[float(pt[0]), float(pt[1])] for pt in d['index_points']]
                press_points.append(new_d)
        drawing_data['press_points'] = press_points

        # ---------- 琴枕/琴桥中心点（转换坐标） ----------
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
        self.hand_detector.close()
        del self.yolo_model
        cv2.destroyAllWindows()
        logger.info("识别器资源已释放")