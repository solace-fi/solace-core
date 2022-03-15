# Reads all artifacts from artifacts/contracts/, pulls the abis, indexes them, then writes to abi/

from glob import glob
import subprocess
import json

# clean filesystem
subprocess.run(['rm', '-rf', 'abi'])
# get files
filenames = glob('artifacts/contracts/**/*', recursive=True)
filenames = filter(lambda filename: filename[-5:] != ".json", filenames)
filenames = sorted(filenames)
# get dirs
dirs = sorted(set(map(lambda dir: 'abi/{}'.format(dir[20:]), map(lambda filename: filename[:filename.rfind('/')], filenames))))
# make dirs
for i in range(len(dirs)):
    if dirs[i][-1] != '/':
        dirs[i] += '/'
    subprocess.run(['mkdir', dirs[i]])
# gitignore
with open('abi/.gitignore', 'w') as f:
    f.write('*')
# for each file
filenames2 = list(filter(lambda filename: filename[-4:] == '.sol', filenames))
for filename in filenames2:
    # read abi from file
    si = filename.rfind('/')
    di = filename.rfind('.')
    filename2 = f"{filename}{filename[si:di]}.json"
    f1 = open(filename2, 'r')
    abi = json.loads(f1.read())["abi"]
    f1.close()
    # write abi to file
    filename3 = f"abi/{filename[20:]}".replace('.sol', '.json')
    f2 = open(filename3, 'w')
    f2.write(json.dumps(abi, separators=(',', ':')))
    f2.close()
# make html files
for dir in dirs:
    filenames3 = glob(f"{dir}*")
    #links = dirs2 + filenames4
    dirs2 = sorted(filter(lambda filename: filename[-5:] != ".json", filenames3))
    s = "<html>\n  <ul>\n"
    for link in dirs2:
        li = link[link.rfind('/')+1:]
        s = f'{s}    <li><a href="{li}/index.html">{li}</a></li>\n'
    filenames4 = sorted(filter(lambda filename: filename[-5:] == ".json", filenames3))
    for link in filenames4:
        li = link[link.rfind('/')+1:]
        s = f'{s}    <li><a href="{li}">{li}</a></li>\n'
    s = f'{s}  </ul>\n</html>'
    filename4 = f"{dir}{'' if dir[-1] == '/' else '/'}index.html"
    f3 = open(filename4, 'w')
    f3.write(s)
    f3.close()
