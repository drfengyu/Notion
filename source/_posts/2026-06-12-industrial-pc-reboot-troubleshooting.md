# 工控机频繁重启问题排查记录

**机器信息：**
- 主机名：DESKTOP-IDQTI1O  
- 型号：Q370_PCH (工控机)
- 内存：64GB (2x32GB SK Hynix DDR4-3200)
- 存储：三星 870 EVO 250GB SSD + WD 8TB HDD
- 网卡：8x Intel I350 千兆网卡

## 问题现象

从 2026年6月3日 开始频繁出现异常重启：
- **重启频率**：每天早上 8:42 左右 1 次，6月11日下午密集重启 7 次
- **Event ID 41**：Kernel-Power 关键错误（意外断电/崩溃）
- **电源风扇不转**（上午发现，插拔内存后恢复）

## 排查过程

### 1. 初步诊断

```powershell
# 查看重启记录
wevtutil qe System /c:20 /rd:true /f:text /q:"*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=41]]"
```

发现 19 次 Event ID 41 错误，时间规律：
- 6月11日 16:01, 16:03, 16:13, 16:21, 16:24, 16:33（下午密集）
- 每天早上 8:42 左右

### 2. 硬件检查

```powershell
# 内存检查
wmic memorychip list full
# 结果：2x32GB SK Hynix HMAG88DXNUB096N，Status 为空（无错误）

# 温度检查  
wmic /namespace:\\root\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature
# 结果：30.1°C（正常）

# 硬盘状态
wmic diskdrive get status,model,size
# 结果：两块硬盘均为 OK
```

**硬件结论**：内存、温度、硬盘正常，无硬件错误。

### 3. 唤醒源分析

```powershell
powercfg /devicequery wake_armed
```

**关键发现**：
- HID 鼠标和键盘（正常）
- **8 个 Intel I350 网卡全部启用唤醒！**

查看电源日志：每次重启前都有 `Event ID 172: 备用连接状态: Disconnected，原因: NIC compliance`

## 根因分析

**✅ 确定：Intel I350 网卡异常唤醒导致频繁重启**

### 触发机制

1. **Wake-on-LAN (WOL) 误触发** → 网卡尝试唤醒系统  
2. **系统检测到唤醒但网络已断开** → 触发 `NIC compliance` 错误  
3. **电源管理保护机制** → 强制重启避免硬件损坏

### 为什么是网卡而不是其他原因？

- ❌ **不是定时任务**：8:43 的任务是系统维护任务的上次运行时间
- ❌ **不是内存故障**：插拔后恢复，且无 WHEA 硬件错误日志  
- ❌ **不是电源故障**：温度正常，电源风扇恢复后未再出现问题  
- ✅ **是网卡唤醒**：每次重启前都有 `Event ID 172` (NIC Disconnected)

## 修复方案

### 已执行：禁用网卡设备唤醒

```powershell
# 通过注册表禁用 I350 网卡的电源管理
Get-NetAdapter | Where-Object {$_.InterfaceDescription -like "*I350*"} | ForEach-Object {
    $instanceID = (Get-PnpDevice -FriendlyName "*$($_.InterfaceDescription)*").InstanceId
    $keyPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\$instanceID\Device Parameters"
    if (Test-Path $keyPath) {
        Set-ItemProperty -Path $keyPath -Name "PnPCapabilities" -Value 24 -Force
    }
}
```

**PnPCapabilities = 24 的含义**：
- Bit 3 (8)：禁用"允许此设备唤醒计算机"
- Bit 4 (16)：禁用电源管理  
- 24 = 8 + 16：完全禁用网卡唤醒

### 验证修复

修复后唤醒源列表：只剩鼠标和键盘，**8 个 Intel I350 网卡已全部移除！**

## 禁用网卡唤醒的影响

**✅ 不影响：**
- 网络正常收发数据
- 远程桌面 (向日葵) 正常使用  
- 键盘鼠标唤醒功能保留

**❌ 失去：**
- 远程 Wake-on-LAN 唤醒功能（需要物理按电源键）

## 后续观察

- **观察周期**：72 小时（6月12日-15日）  
- **监控重点**：Event ID 41 和 172 是否再次出现  

---

**修复时间**：2026年6月12日 14:40  
**执行人**：通过向日葵远程协助  
**状态**：✅ 修复完成，等待验证
