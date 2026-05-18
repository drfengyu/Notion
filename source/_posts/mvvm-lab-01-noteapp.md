---
title: CommunityToolkit.Mvvm 实战 (1) — 完整便签应用
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
  - 实战
categories:
  - MVVM 实战
---

## 本篇定位

前面 11 篇分析了源码，这篇用**一个完整的便签应用**串联所有知识点。

---

## 项目结构

```
NoteApp/
├── Models/
│   └── Note.cs                 # 数据模型（POCO）
├── ViewModels/
│   ├── MainViewModel.cs        # 主 ViewModel
│   ├── NoteDetailViewModel.cs  # 详情 ViewModel
│   └── NoteListViewModel.cs    # 列表 ViewModel
├── Views/
│   ├── MainWindow.xaml
│   ├── NoteDetailView.xaml
│   └── NoteListView.xaml
├── Services/
│   └── INoteService.cs         # 数据服务
└── App.xaml.cs                 # DI 配置
```

---

## 1. Model — 数据模型

```csharp
// Models/Note.cs
public class Note
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Content { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public bool IsCompleted { get; set; }
}
```

纯 POCO，没有通知机制。需要用 ViewModel 包装。

---

## 2. Service — 数据服务

```csharp
// Services/INoteService.cs
public interface INoteService
{
    Task<List<Note>> GetAllAsync();
    Task<Note?> GetByIdAsync(int id);
    Task SaveAsync(Note note);
    Task DeleteAsync(int id);
}

// Services/NoteService.cs
public class NoteService : INoteService
{
    private List<Note> _notes = new();
    private int _nextId = 1;

    public Task<List<Note>> GetAllAsync()
        => Task.FromResult(_notes.ToList());

    public Task<Note?> GetByIdAsync(int id)
        => Task.FromResult(_notes.FirstOrDefault(n => n.Id == id));

    public Task SaveAsync(Note note)
    {
        if (note.Id == 0)
        {
            note.Id = _nextId++;
            _notes.Add(note);
        }
        else
        {
            var index = _notes.FindIndex(n => n.Id == note.Id);
            if (index >= 0) _notes[index] = note;
        }
        return Task.CompletedTask;
    }

    public Task DeleteAsync(int id)
    {
        _notes.RemoveAll(n => n.Id == id);
        return Task.CompletedTask;
    }
}
```

---

## 3. MainViewModel — 页面导航 + 消息通信

```csharp
// ViewModels/MainViewModel.cs
public partial class MainViewModel : ObservableRecipient
{
    private readonly INoteService _noteService;

    // 当前显示的子 ViewModel
    [ObservableProperty]
    private object? _currentViewModel;

    // 从 IServiceProvider 注入依赖
    public MainViewModel(INoteService noteService,
        NoteListViewModel noteList,
        NoteDetailViewModel noteDetail)
    {
        _noteService = noteService;

        // 注册消息接收
        IsActive = true;
    }

    // 接收导航消息
    protected override void OnActivated()
    {
        // 注册导航请求
        Messenger.Register<NavigateToDetailMessage>(this, (r, m) =>
        {
            var vm = (MainViewModel)r;
            var detail = App.Services.GetRequiredService<NoteDetailViewModel>();
            detail.LoadNote(m.NoteId);
            vm.CurrentViewModel = detail;
        });

        Messenger.Register<NavigateToListMessage>(this, (r, m) =>
        {
            var vm = (MainViewModel)r;
            vm.CurrentViewModel = App.Services.GetRequiredService<NoteListViewModel>();
        });

        // 初始加载列表
        CurrentViewModel = App.Services.GetRequiredService<NoteListViewModel>();
    }
}

// 定义导航消息
public sealed record NavigateToDetailMessage(int NoteId);
public sealed record NavigateToListMessage;
```

---

## 4. NoteListViewModel — 列表页（命令 + 异步 + 消息）

```csharp
// ViewModels/NoteListViewModel.cs
public partial class NoteListViewModel : ObservableObject
{
    private readonly INoteService _noteService;

    [ObservableProperty]
    private List<Note> _notes = new();

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string _statusText = "就绪";

    // ---- 加载命令（AsyncRelayCommand） ----
    [RelayCommand]
    private async Task LoadNotesAsync()
    {
        IsLoading = true;
        StatusText = "加载中...";
        try
        {
            Notes = await _noteService.GetAllAsync();
            StatusText = $"共 {Notes.Count} 条便签";
        }
        catch (Exception ex)
        {
            StatusText = $"加载失败: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    // ---- 添加命令 ----
    [RelayCommand]
    private void AddNote()
    {
        WeakReferenceMessenger.Default.Send(
            new NavigateToDetailMessage(0)); // 0 = 新建
    }

    // ---- 编辑命令（泛型参数） ----
    [RelayCommand]
    private void EditNote(Note? note)
    {
        if (note is null) return;
        WeakReferenceMessenger.Default.Send(
            new NavigateToDetailMessage(note.Id));
    }

    // ---- 删除命令（异步 + 确认） ----
    [RelayCommand(CanExecute = nameof(CanDeleteNote))]
    private async Task DeleteNoteAsync(Note? note)
    {
        if (note is null) return;
        await _noteService.DeleteAsync(note.Id);
        await LoadNotesAsync();
    }
    private bool CanDeleteNote(Note? note) => note is not null;

    // ---- 构造后自动加载 ----
    public NoteListViewModel(INoteService noteService)
    {
        _noteService = noteService;
    }
}
```

**XAML：**

```xml
<!-- Views/NoteListView.xaml -->
<UserControl>
    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>

        <!-- 工具栏 -->
        <StackPanel Grid.Row="0" Orientation="Horizontal">
            <Button Content="刷新" Command="{Binding LoadNotesCommand}" />
            <Button Content="新建" Command="{Binding AddNoteCommand}" />
        </StackPanel>

        <!-- 列表 -->
        <ListView Grid.Row="1" ItemsSource="{Binding Notes}"
                  SelectedItem="{Binding SelectedNote}">
            <ListView.ItemTemplate>
                <DataTemplate>
                    <StackPanel>
                        <TextBlock Text="{Binding Title}" FontWeight="Bold" />
                        <TextBlock Text="{Binding CreatedAt, StringFormat={}{0:yyyy-MM-dd}}" />
                        <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
                            <Button Content="编辑"
                                    Command="{Binding DataContext.EditNoteCommand,
                                        RelativeSource={RelativeSource AncestorType=UserControl}}"
                                    CommandParameter="{Binding}" />
                            <Button Content="删除"
                                    Command="{Binding DataContext.DeleteNoteCommand,
                                        RelativeSource={RelativeSource AncestorType=UserControl}}"
                                    CommandParameter="{Binding}" />
                        </StackPanel>
                    </StackPanel>
                </DataTemplate>
            </ListView.ItemTemplate>
        </ListView>

        <!-- 状态栏 -->
        <StatusBar Grid.Row="2">
            <TextBlock Text="{Binding StatusText}" />
        </StatusBar>
    </Grid>
</UserControl>
```

---

## 5. NoteDetailViewModel — 详情页（验证 + 异步保存）

```csharp
// ViewModels/NoteDetailViewModel.cs
public partial class NoteDetailViewModel : ObservableValidator
{
    private readonly INoteService _noteService;
    private int _noteId;

    [ObservableProperty]
    [Required(ErrorMessage = "标题不能为空")]
    [MinLength(1)]
    [NotifyDataErrorInfo]
    private string _title = "";

    [ObservableProperty]
    private string _content = "";

    [ObservableProperty]
    private bool _isSaving;

    // 加载便签
    public async void LoadNote(int noteId)
    {
        _noteId = noteId;
        if (noteId == 0) return; // 新建

        var note = await _noteService.GetByIdAsync(noteId);
        if (note is null) return;

        Title = note.Title;
        Content = note.Content;
    }

    // ---- 保存命令（AsyncRelayCommand + 验证） ----
    [RelayCommand]
    private async Task SaveAsync()
    {
        // 先验证
        ValidateAllProperties();
        if (HasErrors) return;

        IsSaving = true;
        try
        {
            var note = new Note
            {
                Id = _noteId,
                Title = Title,
                Content = Content,
                CreatedAt = DateTime.Now
            };
            await _noteService.SaveAsync(note);
            WeakReferenceMessenger.Default.Send(new NavigateToListMessage());
        }
        finally
        {
            IsSaving = false;
        }
    }

    // ---- 取消命令 ----
    [RelayCommand]
    private void Cancel()
    {
        WeakReferenceMessenger.Default.Send(new NavigateToListMessage());
    }

    public NoteDetailViewModel(INoteService noteService)
    {
        _noteService = noteService;
    }
}
```

**XAML：**

```xml
<!-- Views/NoteDetailView.xaml -->
<UserControl>
    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>

        <!-- 标题 -->
        <StackPanel Grid.Row="0">
            <Label>标题</Label>
            <TextBox Text="{Binding Title, UpdateSourceTrigger=PropertyChanged,
                       ValidatesOnNotifyDataErrors=True}" />
        </StackPanel>

        <!-- 内容 -->
        <StackPanel Grid.Row="2">
            <Label>内容</Label>
            <TextBox Text="{Binding Content}" AcceptsReturn="True"
                     MinHeight="200" />
        </StackPanel>

        <!-- 按钮 -->
        <StackPanel Grid.Row="3" Orientation="Horizontal">
            <Button Content="保存" Command="{Binding SaveCommand}" />
            <Button Content="取消" Command="{Binding CancelCommand}" />
        </StackPanel>

        <!-- 保存中提示 -->
        <Grid Grid.RowSpan="4" Background="#80000000"
              Visibility="{Binding IsSaving, Converter={StaticResource BoolToVis}}">
            <TextBlock Text="保存中..." Foreground="White"
                       VerticalAlignment="Center" HorizontalAlignment="Center" />
        </Grid>
    </Grid>
</UserControl>
```

---

## 6. App.xaml.cs — 依赖注入配置

```csharp
// App.xaml.cs
public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        var services = new ServiceCollection();

        // 注册服务
        services.AddSingleton<INoteService, NoteService>();

        // 注册 ViewModel（Transient：每次导航创建新实例）
        services.AddTransient<NoteListViewModel>();
        services.AddTransient<NoteDetailViewModel>();
        services.AddTransient<MainViewModel>();

        // 注册窗口
        services.AddSingleton<MainWindow>();

        Services = services.BuildServiceProvider();

        // 启动
        var mainWindow = Services.GetRequiredService<MainWindow>();
        mainWindow.DataContext = Services.GetRequiredService<MainViewModel>();
        mainWindow.Show();
    }
}
```

---

## 7. 运行流程

```
应用启动
  → MainViewModel 构造（注入 INoteService）
  → IsActive = true → OnActivated() → 注册消息
  → CurrentViewModel = NoteListViewModel
  → 用户点击"新建"
    → NoteListViewModel.AddNote()
    → Send(NavigateToDetailMessage(0))
    → MainViewModel 收到，创建 NoteDetailViewModel
    → LoadNote(0) → 清空表单
  → 用户输入标题、内容
    → NoteDetailViewModel 自动验证
    → 标题为空时显示验证错误
  → 用户点击"保存"
    → ValidateAllProperties()
    → HasErrors 为 false
    → 保存到 NoteService
    → Send(NavigateToListMessage) → 返回列表
    → NoteListViewModel 自动刷新
```

---

## 8. 用时序图看消息流

```
NoteListVM                  MainVM                  NoteDetailVM
    │                          │                         │
    ├─Send(NavigateToDetail)──►│                         │
    │                          ├─new NoteDetailVM        │
    │                          │─CurrentVM = detail─────►├─LoadNote(0)
    │                          │                         │
    │                          │                   用户编辑...
    │                          │                         │
    │                          │ 用户点击保存             │
    │                          │                    ├─ValidateAllProperties
    │                          │                    ├─SaveAsync
    │                          │                    ├─Send(NavigateToList)──►
    │◄─────────────────────────┤                         │
    │ 收到 NavigateToList      │                         │
    │ 重新加载列表              │                         │
```

---

**下一篇预告：社区工具包 MVVM 单元测试实战 — 如何测试 ViewModel**
