from flask import Blueprint, jsonify

chords_bp = Blueprint('chords', __name__)

chords_data = [
    {
        "name": "C",
        "desc": "C 是大三和弦，构成音 C-E-G，开放明亮，大调歌曲基石。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Cm",
        "desc": "Cm 是小三和弦，构成音 C-D#-G，柔和忧伤，情感色彩丰富。如《老男孩》《童话》《安静》。", "difficulty": 2,
        "barre": {"fret": 3, "startString": 5, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 5},
            {"string": 5, "fret": 5}
        ]
    },
    {
        "name": "C7",
        "desc": "C7 是属七和弦，构成音 C-E-G-A#，张力感强，常用于属→主解决。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "Cm7",
        "desc": "Cm7 是小七和弦，构成音 C-D#-G-A#，忧郁爵士味，适合抒情弹唱。如《老男孩》《童话》《安静》。", "difficulty": 2,
        "barre": {"fret": 3, "startString": 5, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 5}
        ]
    },
    {
        "name": "Cmaj7",
        "desc": "Cmaj7 是大七和弦，构成音 C-E-G-B，梦幻温暖，BossaNova/J-Pop必备。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "C6",
        "desc": "C6 是大六和弦，构成音 C-E-G-A，甜美复古，民谣常用。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Cm6",
        "desc": "Cm6 是小六和弦，构成音 C-D#-G-A，忧伤中带暖，爵士标配。如《老男孩》《童话》《安静》。", "difficulty": 2,
        "barre": {"fret": 3, "startString": 5, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 5},
            {"string": 2, "fret": 4}
        ]
    },
    {
        "name": "C9",
        "desc": "C9 是属九和弦，构成音 C-E-G-A#-D，丰富蓝调味，Funk/Soul专用。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 1, "fret": 3}
        ]
    },
    {
        "name": "Cadd9",
        "desc": "Cadd9 是加九和弦，构成音 C-E-G-D，空灵开放，氛围感强。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3},
            {"string": 1, "fret": 3}
        ]
    },
    {
        "name": "Csus2",
        "desc": "Csus2 是挂二和弦，构成音 C-D-G，悬浮朦胧，替代大三和弦。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Csus4",
        "desc": "Csus4 是挂四和弦，构成音 C-F-G，紧张未解决，倾向回到大和弦。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "C7sus4",
        "desc": "C7sus4 是属七挂四，构成音 C-F-G-A#，双重张力，融合/Fusion风。如《老男孩》《童话》《安静》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 3},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "D",
        "desc": "D 是大三和弦，构成音 D-F#-A，开放明亮，大调歌曲基石。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "Dm",
        "desc": "Dm 是小三和弦，构成音 D-F-A，柔和忧伤，情感色彩丰富。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "D7",
        "desc": "D7 是属七和弦，构成音 D-F#-A-C，张力感强，常用于属→主解决。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "Dm7",
        "desc": "Dm7 是小七和弦，构成音 D-F-A-C，忧郁爵士味，适合抒情弹唱。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "Dmaj7",
        "desc": "Dmaj7 是大七和弦，构成音 D-F#-A-C#，梦幻温暖，BossaNova/J-Pop必备。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "D6",
        "desc": "D6 是大六和弦，构成音 D-F#-A-B，甜美复古，民谣常用。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Dm6",
        "desc": "Dm6 是小六和弦，构成音 D-F-A-B，忧伤中带暖，爵士标配。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "D9",
        "desc": "D9 是属九和弦，构成音 D-F#-A-C-E，丰富蓝调味，Funk/Soul专用。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "Dadd9",
        "desc": "Dadd9 是加九和弦，构成音 D-F#-A-E，空灵开放，氛围感强。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "Dsus2",
        "desc": "Dsus2 是挂二和弦，构成音 D-E-A，悬浮朦胧，替代大三和弦。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "Dsus4",
        "desc": "Dsus4 是挂四和弦，构成音 D-G-A，紧张未解决，倾向回到大和弦。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "D7sus4",
        "desc": "D7sus4 是属七挂四，构成音 D-G-A-C，双重张力，融合/Fusion风。如《童年》《倔强》《后来》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "E",
        "desc": "E 是大三和弦，构成音 E-G#-B，开放明亮，大调歌曲基石。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Em",
        "desc": "Em 是小三和弦，构成音 E-G-B，柔和忧伤，情感色彩丰富。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "E7",
        "desc": "E7 是属七和弦，构成音 E-G#-B-D，张力感强，常用于属→主解决。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Em7",
        "desc": "Em7 是小七和弦，构成音 E-G-B-D，忧郁爵士味，适合抒情弹唱。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Emaj7",
        "desc": "Emaj7 是大七和弦，构成音 E-G#-B-D#，梦幻温暖，BossaNova/J-Pop必备。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 1},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "E6",
        "desc": "E6 是大六和弦，构成音 E-G#-B-C#，甜美复古，民谣常用。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2},
            {"string": 2, "fret": 2}
        ]
    },
    {
        "name": "Em6",
        "desc": "Em6 是小六和弦，构成音 E-G-B-C#，忧伤中带暖，爵士标配。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2},
            {"string": 2, "fret": 2}
        ]
    },
    {
        "name": "E9",
        "desc": "E9 是属九和弦，构成音 E-G#-B-D-F#，丰富蓝调味，Funk/Soul专用。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Eadd9",
        "desc": "Eadd9 是加九和弦，构成音 E-G#-B-F#，空灵开放，氛围感强。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2},
            {"string": 2, "fret": 2}
        ]
    },
    {
        "name": "Esus2",
        "desc": "Esus2 是挂二和弦，构成音 E-F#-B，悬浮朦胧，替代大三和弦。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Esus4",
        "desc": "Esus4 是挂四和弦，构成音 E-A-B，紧张未解决，倾向回到大和弦。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "E7sus4",
        "desc": "E7sus4 是属七挂四，构成音 E-A-B-D，双重张力，融合/Fusion风。如《海阔天空》《突然好想你》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "F",
        "desc": "F 是大三和弦，构成音 F-A-C，开放明亮，大调歌曲基石。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Fm",
        "desc": "Fm 是小三和弦，构成音 F-G#-C，柔和忧伤，情感色彩丰富。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "F7",
        "desc": "F7 是属七和弦，构成音 F-A-C-D#，张力感强，常用于属→主解决。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "Fm7",
        "desc": "Fm7 是小七和弦，构成音 F-G#-C-D#，忧郁爵士味，适合抒情弹唱。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "Fmaj7",
        "desc": "Fmaj7 是大七和弦，构成音 F-A-C-E，梦幻温暖，BossaNova/J-Pop必备。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "F6",
        "desc": "F6 是大六和弦，构成音 F-A-C-D，甜美复古，民谣常用。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Fm6",
        "desc": "Fm6 是小六和弦，构成音 F-G#-C-D，忧伤中带暖，爵士标配。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "F9",
        "desc": "F9 是属九和弦，构成音 F-A-C-D#-G，丰富蓝调味，Funk/Soul专用。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3},
            {"string": 1, "fret": 3}
        ]
    },
    {
        "name": "Fadd9",
        "desc": "Fadd9 是加九和弦，构成音 F-A-C-G，空灵开放，氛围感强。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3},
            {"string": 1, "fret": 3}
        ]
    },
    {
        "name": "Fsus2",
        "desc": "Fsus2 是挂二和弦，构成音 F-G-C，悬浮朦胧，替代大三和弦。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Fsus4",
        "desc": "Fsus4 是挂四和弦，构成音 F-A#-C，紧张未解决，倾向回到大和弦。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "F7sus4",
        "desc": "F7sus4 是属七挂四，构成音 F-A#-C-D#，双重张力，融合/Fusion风。如《夜空中最亮的星》《演员》。", "difficulty": 3,
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "G",
        "desc": "G 是大三和弦，构成音 G-B-D，开放明亮，大调歌曲基石。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "Gm",
        "desc": "Gm 是小三和弦，构成音 G-A#-D，柔和忧伤，情感色彩丰富。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 2,
        "barre": {"fret": 3, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 5},
            {"string": 5, "fret": 5}
        ]
    },
    {
        "name": "G7",
        "desc": "G7 是属七和弦，构成音 G-B-D-F，张力感强，常用于属→主解决。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "Gm7",
        "desc": "Gm7 是小七和弦，构成音 G-A#-D-F，忧郁爵士味，适合抒情弹唱。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 2,
        "barre": {"fret": 3, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 5}
        ]
    },
    {
        "name": "Gmaj7",
        "desc": "Gmaj7 是大七和弦，构成音 G-B-D-F#，梦幻温暖，BossaNova/J-Pop必备。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 2}
        ]
    },
    {
        "name": "G6",
        "desc": "G6 是大六和弦，构成音 G-B-D-E，甜美复古，民谣常用。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Gm6",
        "desc": "Gm6 是小六和弦，构成音 G-A#-D-E，忧伤中带暖，爵士标配。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 2,
        "barre": {"fret": 3, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 5},
            {"string": 5, "fret": 5},
            {"string": 2, "fret": 5}
        ]
    },
    {
        "name": "G9",
        "desc": "G9 是属九和弦，构成音 G-B-D-F-A，丰富蓝调味，Funk/Soul专用。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Gadd9",
        "desc": "Gadd9 是加九和弦，构成音 G-B-D-A，空灵开放，氛围感强。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Gsus2",
        "desc": "Gsus2 是挂二和弦，构成音 G-A-D，悬浮朦胧，替代大三和弦。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "Gsus4",
        "desc": "Gsus4 是挂四和弦，构成音 G-C-D，紧张未解决，倾向回到大和弦。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 2, "fret": 3},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "G7sus4",
        "desc": "G7sus4 是属七挂四，构成音 G-C-D-F，双重张力，融合/Fusion风。如《朋友》《蓝莲花》《真的爱你》。", "difficulty": 1,
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 2, "fret": 3},
            {"string": 6, "fret": 3},
            {"string": 5, "fret": 1}
        ]
    },
    {
        "name": "A",
        "desc": "A 是大三和弦，构成音 A-C#-E，开放明亮，大调歌曲基石。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Am",
        "desc": "Am 是小三和弦，构成音 A-C-E，柔和忧伤，情感色彩丰富。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "A7",
        "desc": "A7 是属七和弦，构成音 A-C#-E-G，张力感强，常用于属→主解决。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Am7",
        "desc": "Am7 是小七和弦，构成音 A-C-E-G，忧郁爵士味，适合抒情弹唱。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Amaj7",
        "desc": "Amaj7 是大七和弦，构成音 A-C#-E-G#，梦幻温暖，BossaNova/J-Pop必备。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "A6",
        "desc": "A6 是大六和弦，构成音 A-C#-E-F#，甜美复古，民谣常用。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Am6",
        "desc": "Am6 是小六和弦，构成音 A-C-E-F#，忧伤中带暖，爵士标配。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "A9",
        "desc": "A9 是属九和弦，构成音 A-C#-E-G-B，丰富蓝调味，Funk/Soul专用。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 1}
        ]
    },
    {
        "name": "Aadd9",
        "desc": "Aadd9 是加九和弦，构成音 A-C#-E-B，空灵开放，氛围感强。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Asus2",
        "desc": "Asus2 是挂二和弦，构成音 A-B-E，悬浮朦胧，替代大三和弦。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Asus4",
        "desc": "Asus4 是挂四和弦，构成音 A-D-E，紧张未解决，倾向回到大和弦。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "A7sus4",
        "desc": "A7sus4 是属七挂四，构成音 A-D-E-G，双重张力，融合/Fusion风。如《光辉岁月》《平凡之路》《十年》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "B",
        "desc": "B 是大三和弦，构成音 B-D#-F#，开放明亮，大调歌曲基石。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "Bm",
        "desc": "Bm 是小三和弦，构成音 B-D-F#，柔和忧伤，情感色彩丰富。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "B7",
        "desc": "B7 是属七和弦，构成音 B-D#-F#-A，张力感强，常用于属→主解决。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 2, "fret": 4},
            {"string": 4, "fret": 4}
        ]
    },
    {
        "name": "Bm7",
        "desc": "Bm7 是小七和弦，构成音 B-D-F#-A，忧郁爵士味，适合抒情弹唱。如《再见》《我好想你》《离歌》。", "difficulty": 1,
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Bmaj7",
        "desc": "Bmaj7 是大七和弦，构成音 B-D#-F#-A#，梦幻温暖，BossaNova/J-Pop必备。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "B6",
        "desc": "B6 是大六和弦，构成音 B-D#-F#-G#，甜美复古，民谣常用。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4},
            {"string": 2, "fret": 4}
        ]
    },
    {
        "name": "Bm6",
        "desc": "Bm6 是小六和弦，构成音 B-D-F#-G#，忧伤中带暖，爵士标配。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4},
            {"string": 2, "fret": 4}
        ]
    },
    {
        "name": "B9",
        "desc": "B9 是属九和弦，构成音 B-D#-F#-A-C#，丰富蓝调味，Funk/Soul专用。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 4},
            {"string": 1, "fret": 4}
        ]
    },
    {
        "name": "Badd9",
        "desc": "Badd9 是加九和弦，构成音 B-D#-F#-C#，空灵开放，氛围感强。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4},
            {"string": 1, "fret": 4}
        ]
    },
    {
        "name": "Bsus2",
        "desc": "Bsus2 是挂二和弦，构成音 B-C#-F#，悬浮朦胧，替代大三和弦。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "Bsus4",
        "desc": "Bsus4 是挂四和弦，构成音 B-E-F#，紧张未解决，倾向回到大和弦。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 5},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "B7sus4",
        "desc": "B7sus4 是属七挂四，构成音 B-E-F#-A，双重张力，融合/Fusion风。如《再见》《我好想你》《离歌》。", "difficulty": 3,
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 5},
            {"string": 4, "fret": 4}
        ]
    }
]

@chords_bp.route('/', methods=['GET'])
def get_chords():
    """返回所有和弦数据"""
    return jsonify(chords_data)

# 文件末尾
# 导出供其他模块使用
__all__ = ['chords_data']