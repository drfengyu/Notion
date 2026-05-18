---
title: CommunityToolkit.Mvvm 源码分析 (1) — ObservableObject 篇
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

这是系列的第一篇，我们从最基础的 `ObservableObject` 开始。读完你会理解：

- 为什么 `SetProperty` 的代码要**重复编写**而不是互相调用？
- `INotifyPropertyChanging` 有 Feature Switch 控制
- `TaskNotifier` 如何让 Task 属性也能触发通知？

---

## 1. 继承体系一览

```
ObservableObject (abstract)
  ├── INotifyPropertyChanged
  ├── INotifyPropertyChanging   ← 8.0 新增
  │
  ├── ObservableRecipient       ← +IMessenger
  └── ObservableValidator       ← +INotifyDataErrorInfo
```

---

## 2. 类声明

```csharp
// 文件: ComponentModel/ObservableObject.cs
public abstract class ObservableObject : INotifyPropertyChanged, INotifyPropertyChanging
```

注意两点：
- `abstract`：不希望你直接 `new ObservableObject()`，必须派生使用
- `INotifyPropertyChanging`：8.0 新增，可以通过 Feature Switch 关闭

---

## 3. 事件声明

```csharp
public event PropertyChangedEventHandler? PropertyChanged;
public event PropertyChangingEventHandler? PropertyChanging;
```

`PropertyChanged` 是 WPF 绑定引擎的核心入口。`PropertyChanging` 用于 Before-Change 通知。

---

## 4. 示例一：最简单的数据模型

```csharp
// 一个用户信息数据模型
public class UserInfoViewModel : ObservableObject
{
    private string _userName = "默认用户";
    private int _loginCount;
    private string? _email;

    public string UserName
    {
        get => _userName;
        set => SetProperty(ref _userName, value);
    }

    public int LoginCount
    {
        get => _loginCount;
        set => SetProperty(ref _loginCount, value);
    }

    public string? Email
    {
        get => _email;
        set => SetProperty(ref _email, value);
    }
}
```

**XAML 绑定：**

```xml
<StackPanel>
    <TextBox Text="{Binding UserName, UpdateSourceTrigger=PropertyChanged}" />
    <TextBlock Text="{Binding UserName, StringFormat=当前用户: {0}}" />
    <TextBlock Text="{Binding LoginCount, StringFormat=登录次数: {0}" />
</StackPanel>
```

**运行效果：** 每次在 TextBox 输入时，`UserName` 属性通过 `SetProperty` 更新，UI 自动刷新显示。

---

## 5. OnPropertyChanged — 虚拟方法与辅助方法

源码中有**两个层级**的 OnPropertyChanged：

### 5.1 受保护虚方法（可重写）

```csharp
protected virtual void OnPropertyChanged(PropertyChangedEventArgs e)
{
    ArgumentNullException.ThrowIfNull(e);
    PropertyChanged?.Invoke(this, e);
}
```

### 5.2 非虚辅助方法（便捷调用）

```csharp
protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
{
    OnPropertyChanged(new PropertyChangedEventArgs(propertyName));
}
```

**示例：拦截所有属性变更**

```csharp
public class AuditViewModel : ObservableObject
{
    private string? _name;

    public string? Name
    {
        get => _name;
        set => SetProperty(ref _name, value);
    }

    // 重写虚方法，统一拦截所有属性变更
    protected override void OnPropertyChanged(PropertyChangedEventArgs e)
    {
        Console.WriteLine($"[审计] 属性 {e.PropertyName} 已变更");
        base.OnPropertyChanged(e);  // ← 记得调用基类，否则 UI 不更新
    }
}

// 测试代码
var vm = new AuditViewModel();
vm.Name = "测试";
// 输出: [审计] 属性 Name 已变更
```

---

## 6. SetProperty 源码详解

### 6.1 最常用重载（ref T field, T newValue）

```csharp
protected bool SetProperty<T>(
    [NotNullIfNotNull(nameof(newValue))] ref T field,
    T newValue,
    [CallerMemberName] string? propertyName = null)
{
    if (EqualityComparer<T>.Default.Equals(field, newValue))
        return false;

    OnPropertyChanging(propertyName);
    field = newValue;
    OnPropertyChanged(propertyName);
    return true;
}
```

**源码注释透露了重要设计决策：**

> 我们在这里重复代码而不调用其他重载，是因为不能保证被调用的 SetProperty<T> 会被内联。我们需要 JIT 能看到完整的 `EqualityComparer<T>.Default.Equals` 调用，这样它才能使用内置的 intrinsics 版本，对于原始数值类型直接替换为简单的比较指令。

换句话说：**性能优先**，手动展开，让 JIT 能充分优化。

### 6.2 示例：返回值的用法

```csharp
public class FormViewModel : ObservableObject
{
    private string _name = "";
    private bool _isDirty;

    public string Name
    {
        get => _name;
        set
        {
            // SetProperty 返回 bool，指示值是否真的变了
            if (SetProperty(ref _name, value))
            {
                // 值变了 → 标记为已修改
                IsDirty = true;
            }
        }
    }

    private bool _isDirty;
    public bool IsDirty
    {
        get => _isDirty;
        set => SetProperty(ref _isDirty, value);
    }

    public void Save()
    {
        Console.WriteLine("保存完成");
        IsDirty = false;
    }
}

// 测试代码
var vm = new FormViewModel();
Console.WriteLine(vm.IsDirty);  // False

vm.Name = "新值";
Console.WriteLine(vm.IsDirty);  // True（SetProperty 返回了 true）

vm.Name = "新值";  // 相同值
Console.WriteLine(vm.IsDirty);  // True（SetProperty 返回 false，没进 if）
```

### 6.3 示例：自定义比较器

```csharp
public class ConfigViewModel : ObservableObject
{
    private string _keyword = "";

    public string Keyword
    {
        get => _keyword;
        // 忽略大小写比较：输入 "ABC" 和 "abc" 视为相同
        set => SetProperty(ref _keyword, value, StringComparer.OrdinalIgnoreCase);
    }
}

// 测试代码
var vm = new ConfigViewModel();
vm.Keyword = "Hello";
bool changed = SetProperty(ref _keyword, "HELLO", StringComparer.OrdinalIgnoreCase);
Console.WriteLine(changed);  // False（因为忽略大小写后相等）
```

### 6.4 示例：无 ref 字段版（回调模式）

当属性不是直接由字段存储时（比如索引器），用回调版本：

```csharp
public class DictionaryViewModel : ObservableObject
{
    private Dictionary<string, string> _data = new();

    // 模拟索引器属性
    public string GetValue(string key, string defaultValue)
    {
        return _data.TryGetValue(key, out var v) ? v : defaultValue;
    }

    public void SetValue(string key, string newValue, string oldValue)
    {
        // 注意：没有 ref 字段，用回调更新
        SetProperty(oldValue, newValue, () =>
        {
            _data[key] = newValue;
        });
    }
}
```

### 6.5 示例：嵌套模型代理

包装不支持 INotifyPropertyChanged 的 POCO 模型：

```csharp
// 不能改的第三方模型
public class PersonModel
{
    public string Name { get; set; }  // 没有通知
    public int Age { get; set; }
}

// 包装成可观察的 ViewModel
public class BindablePerson : ObservableObject
{
    public PersonModel Model { get; }

    public BindablePerson(PersonModel model)
    {
        Model = model;
    }

    public string Name
    {
        get => Model.Name;
        set => SetProperty(Model.Name, value, Model,
            (model, name) => model.Name = name);
    }

    public int Age
    {
        get => Model.Age;
        set => SetProperty(Model.Age, value, Model,
            (model, age) => model.Age = age);
    }
}

// 使用
var person = new BindablePerson(new PersonModel { Name = "Tom", Age = 25 });
person.Name = "Jerry";  // 触发 PropertyChanged，UI 更新
// 底层 Model.Name 也被更新为 "Jerry"
```

---

## 7. SetPropertyAndNotifyOnCompletion — Task 属性通知

### 7.1 使用场景

绑定 Task 属性时，UI 需要知道 Task 何时完成：

```xml
<TextBlock Text="{Binding LoadTask.Status}" />
<!-- 当 Task 从 Running → RanToCompletion 时 Status 自动更新 -->
```

### 7.2 完整示例

```csharp
public class DataViewModel : ObservableObject
{
    // 使用 TaskNotifier 作为字段类型
    private TaskNotifier? _loadTask;

    // 对外暴露 Task 属性（隐式转换）
    public Task? LoadTask
    {
        get => _loadTask;
        private set => SetPropertyAndNotifyOnCompletion(ref _loadTask, value);
    }

    private int _progress;
    public int Progress
    {
        get => _progress;
        set => SetProperty(ref _progress, value);
    }

    [RelayCommand]
    private async Task LoadDataAsync()
    {
        LoadTask = LoadInternalAsync();

        // 等待过程中，UI 绑定了 LoadTask.Status
        // 显示 "Running" → "RanToCompletion"
    }

    private async Task LoadInternalAsync()
    {
        for (int i = 0; i <= 100; i += 20)
        {
            await Task.Delay(300);
            Progress = i;
        }
    }
}
```

**XAML 绑定：**

```xml
<StackPanel>
    <ProgressBar Value="{Binding Progress}" />
    <TextBlock Text="{Binding LoadTask.Status}" />
</StackPanel>
<!-- 
  运行中 → ProgressBar 递增，TextBlock 显示 "Running"
  完成后 → ProgressBar 满，TextBlock 显示 "RanToCompletion"
-->
```

### 7.3 为什么要用 TaskNotifier？

```csharp
// ❌ 错误尝试：直接用 Task
private Task _loadTask;
public Task LoadTask
{
    get => _loadTask;
    set
    {
        // 这样赋值后，UI 绑定的 LoadTask.Status 不会更新
        _loadTask = value;
        OnPropertyChanged();
        // 问题：当 value 完成后，UI 不知道
    }
}

// ✅ 正确：用 SetPropertyAndNotifyOnCompletion
// 内部用 async void MonitorTask 监控 Task 完成
// 完成后自动再次触发 PropertyChanged
```

---

## 8. 源码最佳实践

### 8.1 重写 OnPropertyChanged 而非 SetProperty

```csharp
// ✅ 正确 — 重写虚方法，统一拦截所有属性变更
protected override void OnPropertyChanged(PropertyChangedEventArgs e)
{
    // 在这里统一加日志、AOP、审计
    Log.Debug($"Property changed: {e.PropertyName}");

    if (e.PropertyName == nameof(FirstName) || e.PropertyName == nameof(LastName))
    {
        // 通知 FullName 也变了
        base.OnPropertyChanged(PropertyChangedEventArgsCache.FullName);
    }
    else
    {
        base.OnPropertyChanged(e);
    }
}

// ❌ 错误 — 每个 setter 里手动触发
public string FirstName
{
    set
    {
        SetProperty(ref _firstName, value);
        OnPropertyChanged(nameof(FullName)); // 到处散落，难维护
    }
}
```

### 8.2 利用 Feature Switch 关闭 PropertyChanging

```xml
<!-- Directory.Build.props -->
<PropertyGroup>
    <CommunityToolkitMvvmEnableINotifyPropertyChangingSupport>false</CommunityToolkitMvvmEnableINotifyPropertyChangingSupport>
</PropertyGroup>
```

### 8.3 为什么不建议继承 ObservableObject？

```csharp
// ❌ 不推荐：框架设计为 abstract，就是让你别直接 new
var obj = new ObservableObject();  // 编译错误

// ✅ 正确：定义自己的 ViewModel 类
public class MyViewModel : ObservableObject { }
```

---

## 9. 手写最小实现（20 行版）

```csharp
public class MiniObservableObject : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    protected bool SetProperty<T>(ref T field, T value,
        [CallerMemberName] string name = "")
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }
}

// 用它写一个 ViewModel
public class MiniViewModel : MiniObservableObject
{
    private string _text = "";
    public string Text
    {
        get => _text;
        set => SetProperty(ref _text, value);
    }
}
```

---

**下一篇预告：RelayCommand 源码分析 — ICommand 的实现艺术**
