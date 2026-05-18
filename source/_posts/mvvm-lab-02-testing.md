---
title: CommunityToolkit.Mvvm 实战 (2) — 单元测试 ViewModel
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
  - 测试
  - xUnit
categories:
  - MVVM 实战
---

## 本篇定位

ViewMode l 包含业务逻辑，需要单元测试。CommunityToolkit.Mvvm 的设计使 ViewModel 可测性很好。

---

## 1. 测试 ObservableObject 属性

```csharp
public class CounterViewModel : ObservableObject
{
    private int _count;
    public int Count
    {
        get => _count;
        set => SetProperty(ref _count, value);
    }

    public RelayCommand IncrementCommand { get; }

    public CounterViewModel()
    {
        IncrementCommand = new RelayCommand(Increment);
    }

    private void Increment() => Count++;
}

// ---- 测试 ----
public class CounterViewModelTests
{
    [Fact]
    public void Count_DefaultValue_ShouldBeZero()
    {
        var vm = new CounterViewModel();
        Assert.Equal(0, vm.Count);
    }

    [Fact]
    public void IncrementCommand_ShouldIncreaseCount()
    {
        var vm = new CounterViewModel();

        vm.IncrementCommand.Execute(null);

        Assert.Equal(1, vm.Count);
    }

    [Fact]
    public void IncrementCommand_MultipleCalls_ShouldAccumulate()
    {
        var vm = new CounterViewModel();

        vm.IncrementCommand.Execute(null);
        vm.IncrementCommand.Execute(null);
        vm.IncrementCommand.Execute(null);

        Assert.Equal(3, vm.Count);
    }

    [Fact]
    public void SetProperty_WhenValueNotChanged_ShouldNotFireEvent()
    {
        var vm = new CounterViewModel();
        int eventCount = 0;
        vm.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(CounterViewModel.Count))
                eventCount++;
        };

        vm.Count = 0; // 默认就是 0

        Assert.Equal(0, eventCount);
    }
}
```

---

## 2. 测试 CanExecute 逻辑

```csharp
public class LoginViewModel : ObservableObject
{
    private string _userName = "";
    public string UserName
    {
        get => _userName;
        set
        {
            if (SetProperty(ref _userName, value))
                LoginCommand.NotifyCanExecuteChanged();
        }
    }

    private string _password = "";
    public string Password
    {
        get => _password;
        set
        {
            if (SetProperty(ref _password, value))
                LoginCommand.NotifyCanExecuteChanged();
        }
    }

    public RelayCommand LoginCommand { get; }

    public LoginViewModel()
    {
        LoginCommand = new RelayCommand(Login, CanLogin);
    }

    private void Login() { /* 登录逻辑 */ }
    private bool CanLogin() => !string.IsNullOrEmpty(UserName)
                            && !string.IsNullOrEmpty(Password);
}

// ---- 测试 ----
public class LoginViewModelTests
{
    [Fact]
    public void LoginCommand_WithoutCredentials_ShouldBeDisabled()
    {
        var vm = new LoginViewModel();

        Assert.False(vm.LoginCommand.CanExecute(null));
    }

    [Fact]
    public void LoginCommand_WithCredentials_ShouldBeEnabled()
    {
        var vm = new LoginViewModel();
        vm.UserName = "admin";
        vm.Password = "123456";

        Assert.True(vm.LoginCommand.CanExecute(null));
    }

    [Fact]
    public void LoginCommand_ClearPassword_ShouldDisable()
    {
        var vm = new LoginViewModel();
        vm.UserName = "admin";
        vm.Password = "123456";
        Assert.True(vm.LoginCommand.CanExecute(null));

        // 清空密码后按钮应禁用
        vm.Password = "";
        Assert.False(vm.LoginCommand.CanExecute(null));
    }

    [Fact]
    public void CanExecuteChanged_ShouldFire_WhenCredentialsChange()
    {
        var vm = new LoginViewModel();
        int fireCount = 0;
        vm.LoginCommand.CanExecuteChanged += (s, e) => fireCount++;

        vm.UserName = "admin";  // 应该触发
        vm.Password = "123";    // 应该触发

        Assert.Equal(2, fireCount);
    }
}
```

---

## 3. 测试 AsyncRelayCommand

```csharp
public class DataViewModel : ObservableObject
{
    private string _data = "";
    public string Data
    {
        get => _data;
        set => SetProperty(ref _data, value);
    }

    private Task<string> _loadTask = Task.FromResult("");
    public Task<string> LoadTask
    {
        get => _loadTask;
        private set => SetPropertyAndNotifyOnCompletion(ref _loadTask, value);
    }

    public AsyncRelayCommand LoadCommand { get; }

    public DataViewModel()
    {
        LoadCommand = new AsyncRelayCommand(LoadAsync);
    }

    private async Task LoadAsync()
    {
        await Task.Delay(100);
        Data = "已完成";
    }
}

// ---- 测试 ----
public class DataViewModelTests
{
    [Fact]
    public async Task LoadCommand_ShouldUpdateData()
    {
        var vm = new DataViewModel();

        await vm.LoadCommand.ExecuteAsync(null);

        Assert.Equal("已完成", vm.Data);
    }

    [Fact]
    public async Task LoadCommand_IsRunning_ShouldBeTrueWhileExecuting()
    {
        var vm = new DataViewModel();
        var task = vm.LoadCommand.ExecuteAsync(null);

        Assert.True(vm.LoadCommand.IsRunning);

        await task;

        Assert.False(vm.LoadCommand.IsRunning);
    }

    [Fact]
    public async Task LoadCommand_CanExecute_ShouldBeFalseWhileRunning()
    {
        var vm = new DataViewModel();
        var task = vm.LoadCommand.ExecuteAsync(null);

        // 执行期间 CanExecute 返回 false（按钮自动禁用）
        Assert.False(vm.LoadCommand.CanExecute(null));

        await task;

        // 完成后恢复
        Assert.True(vm.LoadCommand.CanExecute(null));
    }
}
```

---

## 4. 测试 IMessenger 发送

```csharp
public class NavigationViewModel : ObservableRecipient
{
    public NavigationViewModel(IMessenger messenger) : base(messenger)
    {
    }

    [RelayCommand]
    private void GoToDetail(int id)
    {
        Messenger.Send(new NavigateToDetailMessage(id));
    }
}

// ---- 测试 ----
public class NavigationViewModelTests
{
    [Fact]
    public void GoToDetailCommand_ShouldSendMessage()
    {
        var messenger = new WeakReferenceMessenger();
        var vm = new NavigationViewModel(messenger);

        NavigateToDetailMessage? received = null;
        messenger.Register<NavigateToDetailMessage>(this, (r, m) =>
        {
            received = m;
        });

        vm.GoToDetailCommand.Execute(42);

        Assert.NotNull(received);
        Assert.Equal(42, received!.NoteId);
    }
}
```

---

## 5. 测试 ObservableRecipient 消息接收

```csharp
public class StatusViewModel : ObservableRecipient,
    IRecipient<StatusMessage>
{
    private string _status = "";
    public string Status
    {
        get => _status;
        set => SetProperty(ref _status, value);
    }

    public StatusViewModel(IMessenger messenger) : base(messenger)
    {
        IsActive = true;
    }

    public void Receive(StatusMessage message)
    {
        Status = message.Text;
    }
}

// ---- 测试 ----
public class StatusViewModelTests
{
    [Fact]
    public void ReceiveStatusMessage_ShouldUpdateStatus()
    {
        var messenger = new WeakReferenceMessenger();
        var vm = new StatusViewModel(messenger);

        messenger.Send(new StatusMessage("加载完成"));

        Assert.Equal("加载完成", vm.Status);
    }

    [Fact]
    public void WhenDeactivated_ShouldNotReceiveMessages()
    {
        var messenger = new WeakReferenceMessenger();
        var vm = new StatusViewModel(messenger);

        // 停用
        vm.IsActive = false;
        vm.Status = "";

        messenger.Send(new StatusMessage("不应收到"));

        Assert.Equal("", vm.Status); // 没收到
    }
}
```

---

## 6. 测试 ObservableValidator

```csharp
public class RegisterViewModel : ObservableValidator
{
    [Required(ErrorMessage = "邮箱必填")]
    [EmailAddress(ErrorMessage = "邮箱格式错误")]
    private string _email = "";
    public string Email
    {
        get => _email;
        set => SetProperty(ref _email, value, true);
    }

    public bool TrySubmit()
    {
        ValidateAllProperties();
        return !HasErrors;
    }
}

// ---- 测试 ----
public class RegisterViewModelTests
{
    [Fact]
    public void InvalidEmail_ShouldHaveErrors()
    {
        var vm = new RegisterViewModel();
        vm.Email = "not-an-email";

        vm.TrySubmit();

        Assert.True(vm.HasErrors);
    }

    [Fact]
    public void ValidEmail_ShouldPass()
    {
        var vm = new RegisterViewModel();
        vm.Email = "user@example.com";

        vm.TrySubmit();

        Assert.False(vm.HasErrors);
    }

    [Fact]
    public void ErrorsChanged_ShouldFire_WhenInvalidValueSet()
    {
        var vm = new RegisterViewModel();
        bool fired = false;
        vm.ErrorsChanged += (s, e) => fired = true;

        vm.Email = "invalid";

        Assert.True(fired);
    }
}
```

---

## 7. 测试 Source Generators 生成的代码

```csharp
public partial class FormViewModel : ObservableObject
{
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FullName))]
    private string _firstName;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FullName))]
    private string _lastName;

    public string FullName => $"{FirstName} {LastName}";

    [RelayCommand(CanExecute = nameof(CanSubmit))]
    private void Submit() { Submitted = true; }

    public bool Submitted { get; private set; }
    private bool CanSubmit() => !string.IsNullOrEmpty(FirstName)
                             && !string.IsNullOrEmpty(LastName);
}

// ---- 测试 ----
public class FormViewModelTests
{
    [Fact]
    public void FullName_ShouldCombineFirstAndLast()
    {
        var vm = new FormViewModel();

        vm.FirstName = "John";
        vm.LastName = "Doe";

        // NotifyPropertyChangedFor 使 FullName 保持最新
        Assert.Equal("John Doe", vm.FullName);
    }

    [Fact]
    public void SubmitCommand_WithoutName_ShouldBeDisabled()
    {
        var vm = new FormViewModel();

        Assert.False(vm.SubmitCommand.CanExecute(null));
    }

    [Fact]
    public void SubmitCommand_WithName_ShouldExecute()
    {
        var vm = new FormViewModel();
        vm.FirstName = "John";
        vm.LastName = "Doe";

        Assert.True(vm.SubmitCommand.CanExecute(null));
        vm.SubmitCommand.Execute(null);
        Assert.True(vm.Submitted);
    }
}
```

---

## 8. 测试最佳实践清单

```csharp
// ✅ 1. 使用接口依赖，便于 Mock
public class ViewModel(IService service) { }

// ✅ 2. 注入 IMessenger 而非使用 Default
public class ViewModel(IMessenger messenger) { }

// ✅ 3. 测试 SetProperty 返回值
// SetProperty 返回 true=值变了, false=值相同

// ✅ 4. 测试 PropertyChanged 事件
int count = 0;
vm.PropertyChanged += (s, e) => count++;

// ✅ 5. 测试命令状态
Assert.True(vm.SaveCommand.CanExecute(null));
Assert.False(vm.SaveCommand.CanExecute(null));

// ✅ 6. 异步命令 await ExecuteAsync
await vm.LoadCommand.ExecuteAsync(null);

// ✅ 7. 用 WeakReferenceMessenger 做测试（无需 Mock）
var messenger = new WeakReferenceMessenger();

// ✅ 8. 测试 Partial Methods
// OnNameChanged、OnNameChanging 等钩子
```

---

**下一篇预告：依赖注入集成实战 — Microsoft.Extensions.DependencyInjection 整合**
