# 全局存储位置

设置 → 存储位置配置 Host 上的绝对目录，可分别指定 `.hbar` 数据、缓存、配置、Session JSONL 记录与全局 Skills。字段类型和组件由公开 schema/presentation metadata 决定，设置页布局由 `apps/web/src/settings-presentation.json` 描述。规则来源为 [Schema 设置框架](multi-level/03-schema-settings-framework.md)。

引导文件留在用户目录。Windows 默认是 `%LOCALAPPDATA%/hbar/paths.json`，macOS 默认是 `~/Library/Application Support/hbar/paths.json`，Linux 默认是 `$XDG_DATA_HOME/hbar/paths.json`，没有该环境变量时使用 `~/.local/share/hbar/paths.json`。数据目录不受这个位置限制。旧 version 1 引导文件继续可读，保存独立目录后使用 version 2。

保存只提交切换意图，当前 Host 继续使用原目录。Host 停止后，下次启动先复制 SQLite 投影、持久记录、配置和技能，再打开存储；缓存重新创建。旧文件保留，已复制的相同文件可以恢复继续，目标有不同内容时停止迁移，不能覆盖。软链接、超出 100,000 条目、64 层或 16 GiB 的迁移会停止并保留切换意图。原配置中的 `host.lock` 与 `connection.json` 不复制。凭据命名空间跟随稳定身份，不随目录移动而改变。

保存使用 revision 冲突检查、原操作 ID 与最近 128 个持久回执；未知结果先核对，重试沿用原 ID。界面保留草稿并分别展示当前使用路径与待重启路径。缓存必须与持久数据分离，配置、会话和技能目录不能互相覆盖，新位置不能在待复制的旧目录内，真实路径别名也接受检查。

受管桌面 Host 重启跟随引导文件，并重新定位连接文件。独立启动 Host 时，显式 `--home`、`--data-root`、`--cache-root` / 相应环境变量仍是启动覆盖；要切换数据根目录，应移除或更新这些覆盖。未开启 supervisor 的 Host 需手动关闭后启动。

受管桌面仅跟随属于当前数据目录或其稳定身份的 version 2 指针。另一个显式启动的 profile 不读取其他 profile 的切换意图，也不会显示其他 profile 的路径为自己已保存的位置。
