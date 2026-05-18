---
title: CommunityToolkit.Mvvm 源码分析 (7) — ObservableValidator 篇
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
  - 源码分析
  - 数据验证
categories:
  - MVVM 框架源码分析
---

## 本篇定位

`ObservableValidator` 在 `ObservableObject` 之上增加了 **`INotifyDataErrorInfo` 数据注解验证**。

---

## 1. 示例一：表单验证

```csharp
public partial class RegisterViewModel : ObservableValidator
{
    [ObservableProperty]
    [Required(ErrorMessage = "用户名不能为空")]
    [MinLength(3, ErrorMessage = "用户名至少3个字符")]
    [NotifyDataErrorInfo]
    private string _userName;

    [ObservableProperty]
    [Required(ErrorMessage = "邮箱不能为空")]
    [EmailAddress(ErrorMessage = "邮箱格式不正确")]
    [NotifyDataErrorInfo]
    private string _email;

    [ObservableProperty]
    [Required(ErrorMessage = "密码不能为空")]
    [MinLength(6, ErrorMessage = "密码至少6个字符")]
    [NotifyDataErrorInfo]
    private string _password;

    public bool CanSubmit => !HasErrors;

    [RelayCommand]
    private void Submit()
    {
        // 手动触发所有属性验证
        ValidateAllProperties();

        if (HasErrors) return;

        MessageBox.Show("注册成功！");
    }
}
```

**XAML：**

```xml
<StackPanel>
    <TextBox Text="{Binding UserName, UpdateSourceTrigger=PropertyChanged}" />
    <TextBlock Text="{Binding UserName, 
        ValidatesOnNotifyDataErrors=True,
        NotifyOnValidationError=True}" Foreground="Red" />

    <TextBox Text="{Binding Email}" />
    <TextBlock Text="{Binding Email,
        ValidatesOnNotifyDataErrors=True}" Foreground="Red" />

    <PasswordBox Password="{Binding Password}" />

    <Button Content="注册" Command="{Binding SubmitCommand}" />
</StackPanel>
```

**行为演示：**

| 操作 | 错误状态 |
|------|---------|
| 加载页面 | `HasErrors = true`（所有字段未填） |
| 输入用户名 "ab" | `UserName` 错误："至少3个字符" |
| 输入用户名 "admin" | `UserName` 错误消失 |
| 点击注册 | `ValidateAllProperties()` |
| 全部有效 | `HasErrors = false`，注册成功 |

---

## 2. 示例二：TrySetProperty 先验证再赋值

```csharp
public partial class AgeViewModel : ObservableValidator
{
    [Required]
    [Range(0, 150, ErrorMessage = "年龄必须在0-150之间")]
    private int _age;

    // 自定义验证属性（手动调用）
    public string SetAge(string input)
    {
        if (int.TryParse(input, out int age))
        {
            // TrySetProperty：先验证再赋值
            // 验证失败则属性不变
            if (TrySetProperty(ref _age, age, out var errors))
                return "设置成功";
            else
                return $"验证失败: {string.Join(", ", errors.Select(e => e.ErrorMessage))}";
        }
        return "请输入数字";
    }

    // 验证整个表单
    [RelayCommand]
    private void Save()
    {
        ValidateAllProperties();
        if (HasErrors) return;
        // 保存...
    }
}
```

---

## 3. 示例三：自定义验证注解

```csharp
// 自定义验证注解
public class PasswordMatchAttribute : ValidationAttribute
{
    private readonly string _otherProperty;

    public PasswordMatchAttribute(string otherProperty)
    {
        _otherProperty = otherProperty;
        ErrorMessage = "两次密码不一致";
    }

    protected override ValidationResult? IsValid(object? value,
        ValidationContext validationContext)
    {
        var instance = validationContext.ObjectInstance;
        var otherValue = instance.GetType()
            .GetProperty(_otherProperty)?.GetValue(instance);

        return Equals(value, otherValue)
            ? ValidationResult.Success
            : new ValidationResult(ErrorMessage);
    }
}

// 使用
public partial class RegisterViewModel : ObservableValidator
{
    [ObservableProperty]
    [Required]
    [NotifyDataErrorInfo]
    private string _password;

    [ObservableProperty]
    [Required]
    [PasswordMatch(nameof(Password))]
    [NotifyDataErrorInfo]
    private string _confirmPassword;
}
```

---

## 4. HasErrors O(1) 实现

```csharp
private int totalErrors;

// ↑ 每次验证时更新 totalErrors
// HasErrors 直接检查计数器，不遍历字典
public bool HasErrors => this.totalErrors > 0;
```

---

## 5. ValidateProperty 源码

```csharp
protected internal void ValidateProperty(object? value,
    [CallerMemberName] string propertyName = null!)
{
    // 1. 获取错误列表
    if (!this.errors.TryGetValue(propertyName, out var propertyErrors))
    {
        propertyErrors = new List<ValidationResult>();
        this.errors.Add(propertyName, propertyErrors);
    }

    // 2. 清除旧错误
    bool errorsChanged = propertyErrors.Count > 0;
    propertyErrors.Clear();

    // 3. 调用 System.ComponentModel.DataAnnotations
    this.validationContext.MemberName = propertyName;
    this.validationContext.DisplayName = GetDisplayNameForProperty(propertyName);
    bool isValid = Validator.TryValidateProperty(value, this.validationContext, propertyErrors);

    // 4. 更新 totalErrors
    if (isValid && errorsChanged) this.totalErrors--;
    else if (!isValid && !errorsChanged) this.totalErrors++;

    // 5. 触发事件
    if (errorsChanged || !isValid)
        ErrorsChanged?.Invoke(this, new DataErrorsChangedEventArgs(propertyName));
}
```

---

## 6. ValidateAllProperties 的双路径策略

```csharp
protected void ValidateAllProperties()
{
    // Fast Path: 从源码生成器获取类型特定的委托
    Action<object> validationAction = EntityValidatorMap.GetValue(
        GetType(), type =>
    {
        if (type.Assembly.GetType(
            "CommunityToolkit.Mvvm.ComponentModel.__Internals.__ObservableValidatorExtensions")
            is Type extType &&
            extType.GetMethod("CreateAllPropertiesValidator", new[] { type })
            is MethodInfo method)
        {
            return (Action<object>)method.Invoke(null, new object[] { null })!;
        }
        return Fallback(type); // LINQ Expression 编译
    });

    validationAction(this);
}
```

---

**下一篇预告：StrongReferenceMessenger 源码分析 — Recipient 结构体与 Mapping 设计**
