# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all


runtime_datas, runtime_binaries, runtime_hiddenimports = collect_all("app")


a = Analysis(
    ["aw_server.py"],
    pathex=[],
    binaries=runtime_binaries,
    datas=runtime_datas,
    hiddenimports=runtime_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="aw-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="aw-server",
)
