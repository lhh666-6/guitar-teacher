from flask import Blueprint, jsonify

chords_bp = Blueprint('chords', __name__)

chords_data = [
    {
        "name": "C",
        "desc": "C大调开放和弦",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Cm",
        "desc": "Cm 大横按3品",
        "barre": {"fret": 3, "startString": 5, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 5},
            {"string": 5, "fret": 5}
        ]
    },
    {
        "name": "C7",
        "desc": "C7 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "Cm7",
        "desc": "Cm7 大横按3品",
        "barre": {"fret": 3, "startString": 5, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 5}
        ]
    },
    {
        "name": "Cmaj7",
        "desc": "Cmaj7 开放",
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "C6",
        "desc": "C6 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Cm6",
        "desc": "Cm6 大横按3品",
        "barre": {"fret": 3, "startString": 5, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 5},
            {"string": 2, "fret": 4}
        ]
    },
    {
        "name": "C9",
        "desc": "C9 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 1, "fret": 3}
        ]
    },
    {
        "name": "Cadd9",
        "desc": "Cadd9 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3},
            {"string": 1, "fret": 3}
        ]
    },
    {
        "name": "Csus2",
        "desc": "Csus2 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Csus4",
        "desc": "Csus4 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "C7sus4",
        "desc": "C7sus4 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 3},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "D",
        "desc": "D大调开放",
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "Dm",
        "desc": "Dm 开放",
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "D7",
        "desc": "D7 开放",
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "Dm7",
        "desc": "Dm7 开放",
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "Dmaj7",
        "desc": "Dmaj7 开放",
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "D6",
        "desc": "D6 开放",
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Dm6",
        "desc": "Dm6 开放",
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "D9",
        "desc": "D9 开放",
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "Dadd9",
        "desc": "Dadd9 开放",
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "Dsus2",
        "desc": "Dsus2 开放",
        "positions": [
            {"string": 1, "fret": 2},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "Dsus4",
        "desc": "Dsus4 开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "D7sus4",
        "desc": "D7sus4 开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2}
        ]
    },
    {
        "name": "E",
        "desc": "E大调开放",
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Em",
        "desc": "Em 开放",
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "E7",
        "desc": "E7 开放",
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Em7",
        "desc": "Em7 开放",
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Emaj7",
        "desc": "Emaj7 开放",
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 1},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "E6",
        "desc": "E6 开放",
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2},
            {"string": 2, "fret": 2}
        ]
    },
    {
        "name": "Em6",
        "desc": "Em6 开放",
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2},
            {"string": 2, "fret": 2}
        ]
    },
    {
        "name": "E9",
        "desc": "E9 开放",
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Eadd9",
        "desc": "Eadd9 开放",
        "positions": [
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2},
            {"string": 2, "fret": 2}
        ]
    },
    {
        "name": "Esus2",
        "desc": "Esus2 开放",
        "positions": [
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Esus4",
        "desc": "Esus4 开放",
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "E7sus4",
        "desc": "E7sus4 开放",
        "positions": [
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "F",
        "desc": "F 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Fm",
        "desc": "Fm 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "F7",
        "desc": "F7 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "Fm7",
        "desc": "Fm7 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "Fmaj7",
        "desc": "Fmaj7 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "F6",
        "desc": "F6 大横按1品",
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
        "desc": "Fm6 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "F9",
        "desc": "F9 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3},
            {"string": 1, "fret": 3}
        ]
    },
    {
        "name": "Fadd9",
        "desc": "Fadd9 大横按1品",
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
        "desc": "Fsus2 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "Fsus4",
        "desc": "Fsus4 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 3},
            {"string": 5, "fret": 3}
        ]
    },
    {
        "name": "F7sus4",
        "desc": "F7sus4 大横按1品",
        "barre": {"fret": 1, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 3}
        ]
    },
    {
        "name": "G",
        "desc": "G大调开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "Gm",
        "desc": "Gm 大横按3品",
        "barre": {"fret": 3, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 5},
            {"string": 5, "fret": 5}
        ]
    },
    {
        "name": "G7",
        "desc": "G7 开放",
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "Gm7",
        "desc": "Gm7 大横按3品",
        "barre": {"fret": 3, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 5}
        ]
    },
    {
        "name": "Gmaj7",
        "desc": "Gmaj7 开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 2}
        ]
    },
    {
        "name": "G6",
        "desc": "G6 开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Gm6",
        "desc": "Gm6 大横按3品",
        "barre": {"fret": 3, "startString": 6, "endString": 1},
        "positions": [
            {"string": 4, "fret": 5},
            {"string": 5, "fret": 5},
            {"string": 2, "fret": 5}
        ]
    },
    {
        "name": "G9",
        "desc": "G9 开放",
        "positions": [
            {"string": 1, "fret": 1},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Gadd9",
        "desc": "Gadd9 开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3},
            {"string": 2, "fret": 3}
        ]
    },
    {
        "name": "Gsus2",
        "desc": "Gsus2 开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 5, "fret": 2},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "Gsus4",
        "desc": "Gsus4 开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 2, "fret": 3},
            {"string": 6, "fret": 3}
        ]
    },
    {
        "name": "G7sus4",
        "desc": "G7sus4 开放",
        "positions": [
            {"string": 1, "fret": 3},
            {"string": 2, "fret": 3},
            {"string": 6, "fret": 3},
            {"string": 5, "fret": 1}
        ]
    },
    {
        "name": "A",
        "desc": "A大调开放",
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Am",
        "desc": "Am 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "A7",
        "desc": "A7 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Am7",
        "desc": "Am7 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Amaj7",
        "desc": "Amaj7 开放",
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 1},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "A6",
        "desc": "A6 开放",
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Am6",
        "desc": "Am6 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "A9",
        "desc": "A9 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 1}
        ]
    },
    {
        "name": "Aadd9",
        "desc": "Aadd9 开放",
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Asus2",
        "desc": "Asus2 开放",
        "positions": [
            {"string": 2, "fret": 2},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "Asus4",
        "desc": "Asus4 开放",
        "positions": [
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "A7sus4",
        "desc": "A7sus4 开放",
        "positions": [
            {"string": 2, "fret": 3},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2}
        ]
    },
    {
        "name": "B",
        "desc": "B 大横按2品",
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "Bm",
        "desc": "Bm 大横按2品",
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "B7",
        "desc": "B7 大横按2品",
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 2, "fret": 4},
            {"string": 4, "fret": 4}
        ]
    },
    {
        "name": "Bm7",
        "desc": "Bm7 开放",
        "positions": [
            {"string": 2, "fret": 1},
            {"string": 3, "fret": 2},
            {"string": 4, "fret": 2},
            {"string": 5, "fret": 2}
        ]
    },
    {
        "name": "Bmaj7",
        "desc": "Bmaj7 大横按2品",
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "B6",
        "desc": "B6 大横按2品",
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
        "desc": "Bm6 大横按2品",
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
        "desc": "B9 大横按2品",
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 3},
            {"string": 4, "fret": 4},
            {"string": 1, "fret": 4}
        ]
    },
    {
        "name": "Badd9",
        "desc": "Badd9 大横按2品",
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
        "desc": "Bsus2 大横按2品",
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 4},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "Bsus4",
        "desc": "Bsus4 大横按2品",
        "barre": {"fret": 2, "startString": 6, "endString": 1},
        "positions": [
            {"string": 3, "fret": 5},
            {"string": 4, "fret": 4},
            {"string": 5, "fret": 4}
        ]
    },
    {
        "name": "B7sus4",
        "desc": "B7sus4 大横按2品",
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