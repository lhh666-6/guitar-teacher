from ultralytics import YOLO
model = YOLO("/home/guitar-teacher/models/best.pt")
model.export(format="onnx")  # 会生成 best.onnx