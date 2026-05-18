---
title: CommunityToolkit.Mvvm 源码分析 (9) — RelayCommand<T> 篇
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

泛型版本 RelayCommand，支持命令参数。

---

## 1. 示例一：ListBox 选择

```csharp
public partial class ProductViewModel : ObservableObject
{
    [ObservableProperty]
    private string _selectedProduct = "";

    // RelayCommand<string?> 接收 string 参数
    [RelayCommand]
    private void SelectProduct(string? productName)
    {
        SelectedProduct = productName ?? "";
        MessageBox.Show($"选中: {productName}");
    }

    // 带条件判断
    [RelayCommand(CanExecute = nameof(CanDelete))]
    private void DeleteProduct(string? productName)
    {
        // 删除逻辑
    }

    private bool CanDelete(string? productName)
    {
        return !string.IsNullOrEmpty(productName);
    }
}
```

**XAML：**

```xml
<ListBox ItemsSource="{Binding Products}">
    <ListBox.ItemTemplate>
        <DataTemplate>
            <StackPanel>
                <TextBlock Text="{Binding Name}" />
                <Button Content="选择"
                        Command="{Binding DataContext.SelectProductCommand,
                            RelativeSource={RelativeSource AncestorType=Window}}"
                        CommandParameter="{Binding Name}" />
                <Button Content="删除"
                        Command="{Binding DataContext.DeleteProductCommand,
                            RelativeSource={RelativeSource AncestorType=Window}}"
                        CommandParameter="{Binding Name}" />
            </StackPanel>
        </DataTemplate>
    </ListBox.ItemTemplate>
</ListBox>
```

---

## 2. 示例二：值类型参数

```csharp
public partial class PaginationViewModel : ObservableObject
{
    [ObservableProperty]
    private int _currentPage = 1;

    [ObservableProperty]
    private int _totalPages = 10;

    // int 值类型参数
    [RelayCommand]
    private void GoToPage(int page)
    {
        if (page >= 1 && page <= TotalPages)
            CurrentPage = page;
    }

    // null 参数的处理
    [RelayCommand]
    private void SetPageSize(int? size)
    {
        // int? 是 Nullable<int>，可以接收 null
        if (size.HasValue)
            Console.WriteLine($"每页显示: {size.Value} 条");
    }
}
```

**XAML：**

```xml
<StackPanel>
    <!-- CommandParameter="3" → int 3 -->
    <Button Content="第3页" Command="{Binding GoToPageCommand}"
            CommandParameter="3" />

    <!-- CommandParameter="{x:Null}" → null →
         int? GoToPage 的 CanExecute 返回 false -->
    <Button Content="无效" Command="{Binding GoToPageCommand}"
            CommandParameter="{x:Null}" />
</StackPanel>
```

---

## 3. TryGetCommandArgument 源码

```csharp
[MethodImpl(MethodImplOptions.AggressiveInlining)]
internal static bool TryGetCommandArgument(object? parameter, out T? result)
{
    // 场景 1：null 参数 + T 是引用类型或 Nullable → 允许
    if (parameter is null && default(T) is null)
    {
        result = default;
        return true;
    }

    // 场景 2：参数类型匹配 T
    if (parameter is T argument)
    {
        result = argument;
        return true;
    }

    // 场景 3：类型不匹配
    result = default;
    return false;
}
```

**类型处理表：**

| T 类型 | null 参数 | int 参数 | string 参数 |
|--------|-----------|----------|------------|
| `string` | ✅ `null` | ❌ | ✅ |
| `int` | ❌ `false` | ✅ | ❌ |
| `int?` | ✅ `null` | ✅ | ❌ |
| `object` | ✅ | ✅ | ✅ |

---

## 4. Predicate<T?> 的 CanExecute

```csharp
// RelayCommand<T> 使用 Predicate<T?> 而非 Func<T?, bool>
private readonly Predicate<T?>? canExecute;

[MethodImpl(MethodImplOptions.AggressiveInlining)]
public bool CanExecute(T? parameter)
{
    return this.canExecute?.Invoke(parameter) != false;
}
```

---

## 5. 与非泛型的对比

| 特性 | `RelayCommand` | `RelayCommand<T>` |
|------|---------------|-------------------|
| execute | `Action` | `Action<T?>` |
| canExecute | `Func<bool>` | `Predicate<T?>` |
| 参数 | 忽略 | 类型安全转换 |
| null 安全 | 始终通过 | 值类型时返回 false |
| 装箱 | 无 | 值类型参数有 |

---

**下一篇预告：AsyncRelayCommandOptions 源码分析 — 并发执行与异常流控制**
