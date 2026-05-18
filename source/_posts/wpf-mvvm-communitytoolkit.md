---
title: WPF CommunityToolkit.Mvvm 由浅入深
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
categories:
  - 编程笔记
---

## 概述

CommunityToolkit.Mvvm（原名 Microsoft.Toolkit.Mvvm）是微软官方维护的 MVVM 工具包，提供了一套轻量、高效、可预测的 MVVM 基础设施。它支持 .NET Standard 2.0+，可在 WPF、UWP、WinUI、MAUI 等平台使用。

核心功能：
- `ObservableObject` — 可观察对象基类
- `RelayCommand` — 命令封装
- `ObservableRecipient` — 带消息机制的观察者
- `IMessenger` — 弱引用消息通信
- **Source Generators** — 编译时源代码生成器，减少样板代码

---

## 第一层：基础 — ObservableObject 与 RelayCommand

### ObservableObject

所有 ViewModel 的基类，实现了 `INotifyPropertyChanged`。

```csharp
public class MainViewModel : ObservableObject
{
    private string _name;
    public string Name
    {
        get => _name;
        set => SetProperty(ref _name, value);
    }
}
```

`SetProperty` 做了三件事：
1. 比较新旧值，相等则跳过
2. 赋值
3. 触发 `PropertyChanged` 事件

也可以手动触发：

```csharp
public void Update()
{
    Name = "New";
    OnPropertyChanged(nameof(Name));
}
```

### RelayCommand

将方法暴露为 `ICommand`，用于 View 绑定。

```csharp
public class MainViewModel : ObservableObject
{
    public RelayCommand SubmitCommand { get; }

    public MainViewModel()
    {
        SubmitCommand = new RelayCommand(Submit, CanSubmit);
    }

    private void Submit()
    {
        // 执行逻辑
    }

    private bool CanSubmit() => !string.IsNullOrEmpty(Name);
}
```

带参数的版本 `RelayCommand<T>`：

```csharp
public RelayCommand<string> SaveCommand { get; }

// 绑定：Command="{Binding SaveCommand}" CommandParameter="hello"
```

### View 绑定

```xml
<TextBox Text="{Binding Name}" />
<Button Content="提交" Command="{Binding SubmitCommand}" />
```

---

## 第二层：进阶 — 消息通信与异步命令

### IMessenger 与 ObservableRecipient

`ObservableRecipient` 继承 `ObservableObject`，内置 `IMessenger` 支持，适用于页面间通信。

发送消息：

```csharp
// 注册消息
Messenger.Register<MainViewModel, NavigationMessage>(this, (r, m) =>
{
    r.CurrentView = m.Value;
});

// 发送消息
Messenger.Send(new NavigationMessage("DetailPage"));
```

弱引用机制：`IMessenger` 内部使用弱引用持有接收者，避免内存泄漏。

### AsyncRelayCommand

处理异步操作，自动管理 `IsRunning` 状态。

```csharp
public AsyncRelayCommand LoadDataCommand { get; }

public MainViewModel()
{
    LoadDataCommand = new AsyncRelayCommand(LoadDataAsync);
}

private async Task LoadDataAsync()
{
    // 按钮此时自动禁用（IsRunning = true）
    await Task.Delay(3000);
    // 完成后恢复
}
```

支持取消令牌：

```csharp
public AsyncRelayCommand<CancellationToken> SearchCommand { get; }

private async Task SearchAsync(CancellationToken ct)
{
    await Task.Delay(5000, ct); // 可取消
}
```

---

## 第三层：深入 — Source Generators（推荐）

CommunityToolkit.Mvvm 8.0+ 引入了 **源代码生成器**，大幅减少样板代码。

### [ObservableProperty]

替换手写的属性 + 字段：

```csharp
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty]
    private string _name;

    [ObservableProperty]
    private int _age;
}

// 编译器自动生成：
// public string Name { get; set; } → 属性变更通知
// public int Age { get; set; }
```

属性名转换规则：字段名 `_name` → 属性名 `Name`（去掉下划线 + 驼峰大写）。

### [RelayCommand]

将方法直接转为 `ICommand` 属性：

```csharp
public partial class MainViewModel : ObservableObject
{
    [RelayCommand]
    private void Submit()
    {
        // 编译器生成 SubmitCommand 属性
    }

    [RelayCommand]
    private async Task LoadDataAsync()
    {
        // 生成 AsyncRelayCommand
    }
}
```

带 CanExecute：

```csharp
[RelayCommand(CanExecute = nameof(CanSubmit))]
private void Submit() { }

private bool CanSubmit() => !string.IsNullOrEmpty(Name);
```

### [NotifyPropertyChangedFor]

当属性 A 变化时通知属性 B：

```csharp
[ObservableProperty]
[NotifyPropertyChangedFor(nameof(FullName))]
private string _firstName;

[ObservableProperty]
[NotifyPropertyChangedFor(nameof(FullName))]
private string _lastName;

public string FullName => $"{FirstName} {LastName}";
```

### [NotifyCanExecuteChangedFor]

属性变化时刷新命令状态：

```csharp
[ObservableProperty]
[NotifyCanExecuteChangedFor(nameof(SubmitCommand))]
private string _name;
```

### [ObservableProperty] 完整示例

```csharp
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty]
    private string _name;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SubmitCommand))]
    private string _email;

    partial void OnNameChanged(string value)
    {
        Console.WriteLine($"Name changed to: {value}");
    }

    partial void OnEmailChanged(string value)
    {
        Console.WriteLine($"Email changed to: {value}");
    }

    [RelayCommand(CanExecute = nameof(CanSubmit))]
    private void Submit()
    {
        // 使用 Name、Email
    }

    private bool CanSubmit() => !string.IsNullOrEmpty(Name) && !string.IsNullOrEmpty(Email);
}
```

---

## 第四层：高级模式

### 依赖注入集成

```csharp
// App.xaml.cs
public partial class App : Application
{
    public IServiceProvider Services { get; }

    public App()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IMessenger>(WeakReferenceMessenger.Default);
        services.AddSingleton<IDialogService, DialogService>();
        services.AddTransient<MainViewModel>();
        services.AddTransient<MainWindow>();
        Services = services.BuildServiceProvider();
    }
}

// 带依赖的 ViewModel
public partial class MainViewModel : ObservableRecipient
{
    private readonly IDialogService _dialog;

    public MainViewModel(IDialogService dialog, IMessenger messenger)
        : base(messenger)
    {
        _dialog = dialog;
    }
}
```

### Messenger 消息类型

WeakReferenceMessenger（默认，弱引用）和 StrongReferenceMessenger（强引用，按需手动清理）：

```csharp
// 推荐使用 WeakReferenceMessenger
IMessenger messenger = WeakReferenceMessenger.Default;

// 定义一个消息类
public sealed class UserLoggedInMessage : ValueChangedMessage<string>
{
    public UserLoggedInMessage(string username) : base(username) { }
}

// 发送
WeakReferenceMessenger.Default.Send(new UserLoggedInMessage("admin"));

// 接收
WeakReferenceMessenger.Default.Register<MainViewModel, UserLoggedInMessage>(this, (r, m) =>
{
    r.CurrentUser = m.Value;
});
```

### ObservableObject 扩展

```csharp
// 验证逻辑
public partial class LoginViewModel : ObservableObject
{
    [ObservableProperty]
    [NotifyDataErrorInfo]
    [Required(ErrorMessage = "用户名不能为空")]
    [MinLength(3)]
    private string _username;
}
```

配合 `ObservableValidator` 使用数据注解验证：

```csharp
public partial class LoginViewModel : ObservableValidator
{
    [ObservableProperty]
    [Required]
    [MinLength(3)]
    [NotifyDataErrorInfo]
    private string _username;

    [RelayCommand]
    private void Login()
    {
        ValidateAllProperties();
        if (HasErrors) return;
        // 登录逻辑
    }
}
```

---

## 实战：完整登录页面

### ViewModel

```csharp
public partial class LoginViewModel : ObservableValidator
{
    [ObservableProperty]
    [Required(ErrorMessage = "请输入用户名")]
    [NotifyDataErrorInfo]
    [NotifyCanExecuteChangedFor(nameof(LoginCommand))]
    private string _username;

    [ObservableProperty]
    [Required(ErrorMessage = "请输入密码")]
    [NotifyDataErrorInfo]
    [NotifyCanExecuteChangedFor(nameof(LoginCommand))]
    private string _password;

    [ObservableProperty]
    private string _statusMessage;

    [RelayCommand(CanExecute = nameof(CanLogin))]
    private async Task LoginAsync()
    {
        ValidateAllProperties();
        if (HasErrors) return;

        StatusMessage = "登录中...";
        try
        {
            await Task.Delay(2000); // 模拟网络请求
            StatusMessage = "登录成功";
        }
        catch
        {
            StatusMessage = "登录失败";
        }
    }

    private bool CanLogin() =>
        !string.IsNullOrEmpty(Username) && !string.IsNullOrEmpty(Password);
}
```

### View (XAML)

```xml
<StackPanel MaxWidth="400" HorizontalAlignment="Center" VerticalAlignment="Center">
    <TextBox Text="{Binding Username, UpdateSourceTrigger=PropertyChanged}"
             placeholder="用户名" />
    <PasswordBox Password="{Binding Password, UpdateSourceTrigger=PropertyChanged}"
                 placeholder="密码" />
    <TextBlock Text="{Binding StatusMessage}" />
    <Button Content="登录" Command="{Binding LoginCommand}" />
</StackPanel>
```

---

## 与 Prism 对比

| 特性 | CommunityToolkit.Mvvm | Prism |
|------|----------------------|-------|
| 包体积 | 轻量（~200KB） | 较大 |
| Source Generators | ✅ 原生支持 | ❌ 无 |
| 依赖注入 | 需自行集成 | 内置容器 |
| 导航 | ❌ 需自行实现 | 内置导航 |
| 区域管理 | ❌ | ✅ |
| 学习曲线 | 低 | 中高 |

选型建议：小项目或追求简洁用 CommunityToolkit.Mvvm；大型企业应用，需要导航/区域/模块化用 Prism。

---

## 总结

1. **基础层**：`ObservableObject` + `RelayCommand` 构成 MVVM 最小单元
2. **进阶层**：`AsyncRelayCommand` 处理异步，`IMessenger` 通信
3. **生产力层**：Source Generators（`[ObservableProperty]`、`[RelayCommand]`）消除样板代码
4. **架构层**：依赖注入、`ObservableValidator`、消息解耦

CommunityToolkit.Mvvm 的核心哲学是**约定优于配置 + 编译时代码生成**，让你写更少的代码，做更多的事。
