using CivicBudget.DAL.Infrastructure;

namespace CivicBudget.Api.Infrastructure;

/// <summary>
/// Локальне сховище файлів (замість MinIO, якого в курсовій немає): папка uploads/ поруч із застосунком.
/// Attachment.StorageKey — відносний шлях у цій папці, наприклад projects/16/3f2a….jpg.
/// </summary>
public class FileStorage
{
    /// <summary>Дозволені типи — як у CHECK-обмеженні CK_Attachment_Mime.</summary>
    public static readonly IReadOnlyDictionary<string, string> AllowedTypes = new Dictionary<string, string>
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["application/pdf"] = ".pdf",
    };

    /// <summary>20 МБ — як у CK_Attachment_Size.</summary>
    public const int MaxSize = 20 * 1024 * 1024;

    private readonly string _root;

    public FileStorage(IConfiguration config, IWebHostEnvironment env)
    {
        _root = Path.GetFullPath(Path.Combine(env.ContentRootPath, config["Storage:Uploads"] ?? "uploads"));
        Directory.CreateDirectory(_root);
    }

    public static void Validate(IFormFile file)
    {
        if (file.Length <= 0) throw new BusinessRuleException("Файл порожній.");
        if (file.Length > MaxSize) throw new BusinessRuleException("Файл завеликий: максимум 20 МБ.");
        if (!AllowedTypes.ContainsKey(file.ContentType))
            throw new BusinessRuleException("Дозволено лише JPG, PNG або PDF.");
    }

    /// <summary>Зберігає файл і повертає StorageKey.</summary>
    public async Task<string> SaveAsync(IFormFile file, string folder)
    {
        Validate(file);
        var key = $"{folder}/{Guid.NewGuid():N}{AllowedTypes[file.ContentType]}";
        var path = FullPath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = File.Create(path);
        await file.CopyToAsync(stream);
        return key;
    }

    public Stream? Open(string storageKey)
    {
        var path = FullPath(storageKey);
        return File.Exists(path) ? File.OpenRead(path) : null;
    }

    public void Delete(string storageKey)
    {
        var path = FullPath(storageKey);
        if (File.Exists(path)) File.Delete(path);
    }

    // Шлях усередині кореня сховища (захист від «../» у ключі).
    private string FullPath(string storageKey)
    {
        var path = Path.GetFullPath(Path.Combine(_root, storageKey.Replace('/', Path.DirectorySeparatorChar)));
        if (!path.StartsWith(_root, StringComparison.OrdinalIgnoreCase))
            throw new UnauthorizedAccessException();
        return path;
    }
}
