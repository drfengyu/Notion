---
title: CommunityToolkit.Mvvm 源码分析 (2) — RelayCommand 篇
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
  - 源码分析
categories:
  - MVVM 框架源码分析
---

## 本篇定位

上一篇分析了 ObservableObject 的属性通知机制。这次来看命令系统——`RelayCommand`。读完你会理解：

- `ICommand` 的三个成员在框架内部如何落地？
- 为什么按钮有时不自动禁用/启用？
- `CanExecuteChanged` 的两种实现策略各有什么优劣？

---

## 1. ICommand 接口回顾

```csharp
public interface ICommand
{
    event EventHandler? CanExecuteChanged;  // 通知命令状态变化
    bool CanExecute(object? parameter);     // 判断能否执行
    void Execute(object? parameter);        // 执行命令
}
```

WPF 绑定引擎：按钮点击调用 `Execute`，按钮启用/禁用依赖 `CanExecute`。

---

## 2. 类结构

```csharp
// 文件: Input/RelayCommand.cs
public sealed partial class RelayCommand : IRelayCommand
{
    private readonly Action execute;
    private readonly Func<bool>? canExecute;
}
```

用 `sealed` 标记——不希望你继承。职责单一且确定，不需要扩展点。

---

## 3. 示例一：最简单的按钮命令

```csharp
public class CounterViewModel : ObservableObject
{
    private int _count;
    public int Count
    {
        get => _count;
        set => SetProperty(ref _count, value);
    }

    // 命令属性
    public RelayCommand IncrementCommand { get; }

    public CounterViewModel()
    {
        IncrementCommand = new RelayCommand(Increment);
    }

    private void Increment()
    {
        Count++;
    }
}
```

**XAML：**

```xml
<StackPanel>
    <TextBlock Text="{Binding Count, StringFormat=计数: {0}}" FontSize="48" />
    <Button Content="+1" Command="{Binding IncrementCommand}" />
</StackPanel>
```

**运行效果：** 每次点击按钮，计数 +1，UI 自动刷新。

---

## 4. 示例二：带 CanExecute 的登录按钮

```csharp
public class LoginViewModel : ObservableObject
{
    private string _userName = "";
    private string _password = "";

    public string UserName
    {
        get => _userName;
        set
        {
            if (SetProperty(ref _userName, value))
                LoginCommand.NotifyCanExecuteChanged();  // 手动刷新
        }
    }

    public string Password
    {
        get => _password;
        set
        {
            if (SetProperty(ref _password, value))
                LoginCommand.NotifyCanExecuteChanged();  // 手动刷新
        }
    }

    public RelayCommand LoginCommand { get; }

    public LoginViewModel()
    {
        LoginCommand = new RelayCommand(Login, CanLogin);
    }

    private void Login()
    {
        MessageBox.Show($"登录成功: {UserName}");
    }

    private bool CanLogin()
    {
        return !string.IsNullOrEmpty(UserName) && !string.IsNullOrEmpty(Password);
    }
}
```

**XAML：**

```xml
<StackPanel>
    <TextBox Text="{Binding UserName, UpdateSourceTrigger=PropertyChanged}"
             Placeholder="用户名" />
    <PasswordBox Password="{Binding Password, UpdateSourceTrigger=PropertyChanged}"
                 Placeholder="密码" />
    <Button Content="登录" Command="{Binding LoginCommand}" />
</StackPanel>
```

**行为演示：**

| 状态 | UserName | Password | 登录按钮 |
|------|----------|----------|---------|
| 初始 | 空 | 空 | 禁用 |
| 输入用户名 | "admin" | 空 | 禁用 |
| 输入密码 | "admin" | "123" | 启用 |
| 清空密码 | "admin" | 空 | 禁用 |

**源码联动：** 关键在 `CanExecute` 的实现：

```csharp
[MethodImpl(MethodImplOptions.AggressiveInlining)]
public bool CanExecute(object? parameter)
{
    return this.canExecute?.Invoke() != false;
    // canExecute == null → 返回 true（始终可用）
    // canExecute == SomeFunc → SomeFunc() != false
}
```

---

## 5. 示例三：参数命令（打开文件）

```csharp
public class DocumentViewModel : ObservableObject
{
    private string _selectedFile = "";
    public string SelectedFile
    {
        get => _selectedFile;
        set => SetProperty(ref _selectedFile, value);
    }

    // RelayCommand<string> 接收 string 类型参数
    public RelayCommand<string?> OpenFileCommand { get; }

    public DocumentViewModel()
    {
        OpenFileCommand = new RelayCommand<string?>(OpenFile, CanOpenFile);
    }

    private void OpenFile(string? fileName)
    {
        SelectedFile = fileName!;
        MessageBox.Show($"打开文件: {fileName}");
    }

    private bool CanOpenFile(string? fileName)
    {
        return !string.IsNullOrEmpty(fileName) && File.Exists(fileName);
    }
}
```

**XAML：**

```xml
<StackPanel>
    <ListBox ItemsSource="{Binding Files}" SelectedItem="{Binding SelectedFile}">
        <ListBox.ItemTemplate>
            <DataTemplate>
                <Button Content="{Binding}"
                        Command="{Binding DataContext.OpenFileCommand, RelativeSource={RelativeSource AncestorType=Window}}"
                        CommandParameter="{Binding}" />
            </DataTemplate>
        </ListBox.ItemTemplate>
    </ListBox>
</StackPanel>
```

---

## 6. 示例四：手动刷新命令状态

RelayCommand **不会自动刷新** `CanExecute`。你必须手动调用 `NotifyCanExecuteChanged()`：

```csharp
// 在属性 setter 中手动刷新
public string UserName
{
    set
    {
        if (SetProperty(ref _userName, value))
        {
            LoginCommand.NotifyCanExecuteChanged();  // ← 手动调用！
        }
    }
}
```

**对比两种策略：**

| 策略 | 优点 | 缺点 |
|------|------|------|
| 自动（CommandManager） | 省事，始终最新 | 频繁触发，性能开销 |
| 手动（NotifyCanExecuteChanged） | 精确控制 | 开发者容易忘记 |

**更好的做法 — 用 Source Generators 自动生成：**

```csharp
[ObservableProperty]
[NotifyCanExecuteChangedFor(nameof(LoginCommand))]
private string _userName;

// 生成的 setter 自动包含：
// set {
//     if (SetProperty(ref _userName, value)) {
//         LoginCommand.NotifyCanExecuteChanged();
//     }
// }
```

---

## 7. 源码精读

### 7.1 构造函数

```csharp
public RelayCommand(Action execute)
{
    ArgumentNullException.ThrowIfNull(execute);
    this.execute = execute;
}

public RelayCommand(Action execute, Func<bool> canExecute)
{
    ArgumentNullException.ThrowIfNull(execute);
    ArgumentNullException.ThrowIfNull(canExecute);
    this.execute = execute;
    this.canExecute = canExecute;
}
```

注意：有 `canExecute` 参数的构造中，`canExecute` 也做了 null 检查（不同于早期的 MvvmLight）。

### 7.2 CanExecute

```csharp
[MethodImpl(MethodImplOptions.AggressiveInlining)]
public bool CanExecute(object? parameter)
{
    return this.canExecute?.Invoke() != false;
}
```

`canExecute?.Invoke() != false` 等价于：null 时返回 true，不为 null 时返回委托结果。

### 7.3 CanExecuteChanged 事件

```csharp
public event EventHandler? CanExecuteChanged;

public void NotifyCanExecuteChanged()
{
    CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}
```

---

## 8. 调试技巧：捕捉命令绑定

```csharp
public class DebugRelayCommand : ICommand
{
    private readonly ICommand _inner;

    public DebugRelayCommand(ICommand inner)
    {
        _inner = inner;
        _inner.CanExecuteChanged += (s, e) =>
            Debug.WriteLine($"[Command] CanExecuteChanged");
    }

    public event EventHandler? CanExecuteChanged
    {
        add => _inner.CanExecuteChanged += value;
        remove => _inner.CanExecuteChanged -= value;
    }

    public bool CanExecute(object? p)
    {
        var result = _inner.CanExecute(p);
        Debug.WriteLine($"[Command] CanExecute({p}) = {result}");
        return result;
    }

    public void Execute(object? p)
    {
        Debug.WriteLine($"[Command] Execute({p})");
        _inner.Execute(p);
    }
}
```

---

## 9. 手写最小实现

```csharp
public class MiniRelayCommand : ICommand
{
    private readonly Action _execute;
    private readonly Func<bool>? _canExecute;

    public MiniRelayCommand(Action execute, Func<bool>? canExecute = null)
    {
        _execute = execute;
        _canExecute = canExecute;
    }

    public event EventHandler? CanExecuteChanged;

    public bool CanExecute(object? parameter) => _canExecute?.Invoke() ?? true;

    public void Execute(object? parameter) => _execute();

    public void NotifyCanExecuteChanged()
        => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}
```

---

**下一篇预告：AsyncRelayCommand 源码分析 — 异步命令的状态机实现**
