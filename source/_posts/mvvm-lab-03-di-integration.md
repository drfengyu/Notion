---
title: CommunityToolkit.Mvvm 实战 (3) — DI 容器集成
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
  - 依赖注入
  - DI
categories:
  - MVVM 实战
---

## 本篇定位

CommunityToolkit.Mvvm 不内置 DI 容器，但可以轻松集成 `Microsoft.Extensions.DependencyInjection`。这篇用示例演示完整集成方案。

---

## 1. 安装依赖

```xml
<PackageReference Include="Microsoft.Extensions.DependencyInjection" Version="8.0.0" />
<PackageReference Include="CommunityToolkit.Mvvm" Version="8.2.0" />
```

---

## 2. 基础配置

```csharp
// App.xaml.cs
public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        var services = new ServiceCollection();

        // === 注册服务（单例/作用域） ===
        services.AddSingleton<INoteService, NoteService>();
        services.AddSingleton<IDialogService, DialogService>();
        services.AddSingleton<IMessenger>(WeakReferenceMessenger.Default);

        // === 注册 ViewModel（Transient = 每次导航新实例） ===
        services.AddTransient<MainViewModel>();
        services.AddTransient<NoteListViewModel>();
        services.AddTransient<NoteDetailViewModel>();
        services.AddTransient<SettingsViewModel>();

        // === 注册窗口（单例） ===
        services.AddSingleton<MainWindow>();
        services.AddTransient<SettingsWindow>(); // 弹窗每次新建

        Services = services.BuildServiceProvider();

        // === 启动 ===
        var mainWindow = Services.GetRequiredService<MainWindow>();
        mainWindow.DataContext = Services.GetRequiredService<MainViewModel>();
        mainWindow.Show();
    }
}
```

---

## 3. ViewModel 构造函数注入

```csharp
// 依赖通过构造函数注入
public partial class MainViewModel : ObservableRecipient
{
    private readonly INoteService _noteService;
    private readonly IDialogService _dialogService;
    private readonly IServiceProvider _serviceProvider;

    public MainViewModel(
        INoteService noteService,
        IDialogService dialogService,
        IServiceProvider serviceProvider,
        IMessenger messenger)
        : base(messenger)  // ← 基类注入 IMessenger
    {
        _noteService = noteService;
        _dialogService = dialogService;
        _serviceProvider = serviceProvider;

        IsActive = true;
    }

    // 从 DI 容器创建子 ViewModel
    [RelayCommand]
    private void OpenNoteDetail(int noteId)
    {
        // 每次从 DI 获取新的 NoteDetailViewModel（注入了自己的依赖）
        var detailVm = _serviceProvider.GetRequiredService<NoteDetailViewModel>();
        detailVm.LoadNote(noteId);
        CurrentViewModel = detailVm;
    }
}
```

---

## 4. 工厂模式场景

有时需要运行参数创建 ViewModel，不能用纯构造注入：

```csharp
// 方案 1：IServiceProvider 工厂
public class ViewModelFactory
{
    private readonly IServiceProvider _sp;

    public ViewModelFactory(IServiceProvider sp) => _sp = sp;

    public NoteDetailViewModel CreateNoteDetail(int noteId)
    {
        var vm = _sp.GetRequiredService<NoteDetailViewModel>();
        vm.LoadNote(noteId);
        return vm;
    }
}

// 注册工厂
services.AddSingleton<ViewModelFactory>();

// 方案 2：委托工厂
services.AddTransient<Func<int, NoteDetailViewModel>>(sp =>
{
    return (noteId) =>
    {
        var vm = sp.GetRequiredService<NoteDetailViewModel>();
        vm.LoadNote(noteId);
        return vm;
    };
});

// 使用时
public class MainViewModel
{
    private readonly Func<int, NoteDetailViewModel> _noteDetailFactory;

    public MainViewModel(Func<int, NoteDetailViewModel> noteDetailFactory)
    {
        _noteDetailFactory = noteDetailFactory;
    }

    [RelayCommand]
    private void OpenNote(int id)
    {
        var vm = _noteDetailFactory(id);
        CurrentViewModel = vm;
    }
}
```

---

## 5. 生命周期管理

```csharp
// 不同 Service 生命周期的影响
services.AddSingleton<ICacheService, MemoryCacheService>();
// ↑ 整个应用只有一个实例，适合缓存、配置

services.AddTransient<NoteDetailViewModel>();
// ↑ 每次请求都创建新实例，适合详情页

services.AddScoped<IScopedService, ScopedService>();
// ↑ WPF 没有 Scoped 概念，效果等同 Transient
```

---

## 6. 使用 Ioc 辅助类

CommunityToolkit.Mvvm 内置了 `Ioc` 辅助类（`DependencyInjection/Ioc.cs`）：

```csharp
using CommunityToolkit.Mvvm.DependencyInjection;

// 配置
Ioc.Default.ConfigureServices(services.BuildServiceProvider());

// 使用
var vm = Ioc.Default.GetRequiredService<MainViewModel>();
// 相当于：services.GetRequiredService<MainViewModel>()
```

**完整示例：**

```csharp
// App.xaml.cs
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        var services = new ServiceCollection();
        services.AddSingleton<INoteService, NoteService>();
        services.AddTransient<MainViewModel>();
        services.AddSingleton<MainWindow>();

        Ioc.Default.ConfigureServices(services.BuildServiceProvider());

        var mainWindow = Ioc.Default.GetRequiredService<MainWindow>();
        mainWindow.DataContext = Ioc.Default.GetRequiredService<MainViewModel>();
        mainWindow.Show();
    }
}

// ViewModel 中
public class MainViewModel
{
    public MainViewModel()
    {
        // 可以从 Ioc 直接获取服务
        var noteService = Ioc.Default.GetRequiredService<INoteService>();
    }
}
```

---

## 7. 测试中使用 DI

```csharp
public class IntegrationTests
{
    private readonly IServiceProvider _services;

    public IntegrationTests()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IMessenger>(WeakReferenceMessenger.Default);
        services.AddSingleton<INoteService, NoteService>();
        services.AddTransient<NoteListViewModel>();
        services.AddTransient<NoteDetailViewModel>();
        _services = services.BuildServiceProvider();
    }

    [Fact]
    public void NoteListViewModel_ShouldResolveAllDependencies()
    {
        var vm = _services.GetRequiredService<NoteListViewModel>();
        Assert.NotNull(vm);
    }

    [Fact]
    public void NoteDetail_Save_ShouldNavigateToList()
    {
        var messenger = _services.GetRequiredService<IMessenger>();
        var vm = _services.GetRequiredService<NoteDetailViewModel>();

        NavigateToListMessage? received = null;
        messenger.Register<NavigateToListMessage>(this, (r, m) => received = m);

        vm.Title = "测试标题";
        vm.SaveCommand.Execute(null);

        Assert.NotNull(received);
    }
}
```

---

## 8. 综合模板

创建新项目时的推荐模板结构：

```csharp
// App.xaml.cs — 最简启动模板
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        var services = new ServiceCollection();

        // Services
        services.AddSingleton<IMessenger>(WeakReferenceMessenger.Default);
        services.AddSingleton<IDataService, DataService>();
        services.AddSingleton<IDialogService, DialogService>();

        // ViewModels
        services.AddTransient<MainViewModel>();
        services.AddTransient<DetailViewModel>();

        // Views
        services.AddSingleton<MainWindow>();

        Ioc.Default.ConfigureServices(services.BuildServiceProvider());

        var window = Ioc.Default.GetRequiredService<MainWindow>();
        window.DataContext = Ioc.Default.GetRequiredService<MainViewModel>();
        window.Show();
    }
}
```

```csharp
// MainViewModel.cs — 接收注入的模板
public partial class MainViewModel : ObservableRecipient
{
    public MainViewModel(IMessenger messenger) : base(messenger)
    {
        IsActive = true;
    }
}
```

```xml
<!-- App.xaml — 去掉 StartupUri -->
<Application x:Class="MyApp.App"
             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    <!-- StartupUri 在 App.xaml.cs 中手动控制 -->
</Application>
```

---

**下一篇预告：系列完结 — 从源码到实战全链路总结**
