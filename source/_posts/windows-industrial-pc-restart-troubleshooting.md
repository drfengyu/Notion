---
title: Windows 工控机频繁重启问题排查与修复
date: 2026-06-11
tags: [Windows, 故障排查, 硬件诊断, 系统维护]
categories: 运维
---

## 问题描述

工控机（DESKTOP-JDIF5ST）从 6月7日 至 6月11日 发生 **10次意外重启**，Event ID 41（Kernel-Power）+ 6008（EventLog），无规律性。

## 排查步骤

### 1. 检查系统事件日志

```cmd
wevtutil qe System /c:20 /rd:true /f:text /q:"*[System[(EventID=41 or EventID=6008 or EventID=1074 or EventID=1076)]]"
```

**作用：** 查看最近20条重启相关事件，确认重启时间和频率。

### 2. 检查硬件错误日志

```cmd
wevtutil qe System /c:10 /rd:true /f:text /q:"*[System[Provider[@Name='Microsoft-Windows-WHEA-Logger']]]"
```

**作用：** 检查是否有 CPU/内存/主板硬件故障（WHEA 错误）。
**结果：** 无硬件错误日志 → 排除硬件故障。

### 3. 检查应用程序崩溃

```cmd
wevtutil qe Application /c:10 /rd:true /f:text /q:"*[System[(Level=1 or Level=2)]]"
```

**作用：** 查找崩溃的应用程序。
**发现：** `AicWifiService.exe`（Ugreen WiFi 驱动服务）反复崩溃，异常代码 `0xc0000005`（访问冲突）。

### 4. 检查自动重启设置

```cmd
wmic recoveros get AutoReboot,DebugInfoType
```

**结果：** `AutoReboot=TRUE` → 系统遇到严重错误会自动重启而不显示蓝屏。

### 5. 检查磁盘错误

```cmd
wevtutil qe System /c:5 /rd:true /f:text /q:"*[System[Provider[@Name='disk']]]"
```

**结果：** 有一个2024年的旧磁盘错误记录，不是本次问题原因。

## 根本原因

**Ugreen WiFi 适配器驱动服务（AicWifiServiceD80）质量问题：**

1. **内存访问冲突：** 服务代码有 bug（`VCRUNTIME140_CLR0400.dll` 访问违规）
2. **日志文件锁冲突：** 服务启动时无法访问被占用的日志文件 `C:\Windows\AicWifiServiceLog.txt`
3. **驱动版本过旧：** 版本 1.0.0.2（2019年编译），代码质量差

## 修复方案

### 方案1：重启服务（临时缓解）

```cmd
# 找到正确的服务名
sc query state= all | findstr /i "ugreen aic wifi"

# 重启服务
net stop AicWifiServiceD80 && net start AicWifiServiceD80
net stop WifiAutoInstallSrv && net start WifiAutoInstallSrv
```

### 方案2：启用完整内存转储（用于分析）

```cmd
# 启用完整内存转储
wmic recoveros set DebugInfoType=1

# 启用崩溃转储
reg add "HKLM\SYSTEM\CurrentControlSet\Control\CrashControl" /v CrashDumpEnabled /t REG_DWORD /d 1 /f
```

**效果：** 下次崩溃会生成 `C:\Windows\MEMORY.DMP` 用于详细分析。

### 方案3：更新驱动（根本解决）

1. 访问 Ugreen 官网下载最新版 WiFi 适配器驱动
2. 卸载旧驱动
3. 安装新驱动
4. 重启电脑

## 验证与监控

### 下次重启后立即检查

```cmd
# 检查内存转储文件
dir C:\Windows\MEMORY.DMP

# 查看服务日志
type C:\Windows\AicWifiServiceLog.txt

# 查看最新崩溃记录
wevtutil qe Application /c:5 /rd:true /f:text /q:"*[System[(Level=1 or Level=2)]]"
```

### 观察重启频率

观察 3-5 天，如果重启频率明显降低，说明重启服务有效。

## 预防措施

1. **定期更新驱动：** 特别是第三方 USB 设备驱动
2. **监控服务崩溃：** 定期检查应用程序事件日志
3. **禁用不必要的自动重启：** `wmic recoveros set AutoReboot=FALSE`（仅调试期间）
4. **保持系统更新：** Windows Update 可能包含驱动兼容性修复

## 总结

此次工控机频繁重启的根本原因是 **Ugreen WiFi 驱动服务质量问题**，通过重启服务可以临时缓解，但根本解决需要更新到官方最新驱动。已启用完整内存转储用于后续深入分析。

---

**设备信息：**
- 计算机名：DESKTOP-JDIF5ST
- 系统版本：Windows 10 专业版 (19045.2965)
- 问题驱动：AicWifiService.exe v1.0.0.2
- 问题服务：AicWifiServiceD80, WifiAutoInstallSrv
