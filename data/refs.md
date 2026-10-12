考虑到数据量较大，无法在本地保存，而是保存在远程机器上，具体访问方式为 `ssh 5090gc`

**你只能访问该远程服务器，不允许修改服务器上的任何文件，也不允许在远程服务器上创建任何文件，你对远程服务器的权限只有 读！！**
**也不允许将远程的文件下载到本地来**

以下是对应的文件路径：
- 10KM的输入：/home/gc/npy_local/npyfile_5ch/
- 10KM的Target：/home/gc/npy_local/labelfile_5ch/
- 地形数据：/home/gc/npy_local/static_physics_3km_2ch.npy
- 3KM的Target：/home/gc/npy_local/HR_Label_5ch_3km/
